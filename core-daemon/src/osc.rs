use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// High-level lifecycle states reported by an autonomous agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Working,
    Blocked,
    Done,
    Error,
    Idle,
    #[serde(untagged)]
    Custom(String),
}

impl Default for AgentStatus {
    fn default() -> Self {
        AgentStatus::Idle
    }
}

impl From<&str> for AgentStatus {
    fn from(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "working" => AgentStatus::Working,
            "blocked" => AgentStatus::Blocked,
            "done" => AgentStatus::Done,
            "error" => AgentStatus::Error,
            "idle" => AgentStatus::Idle,
            other => AgentStatus::Custom(other.to_string()),
        }
    }
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentStatus::Working => write!(f, "working"),
            AgentStatus::Blocked => write!(f, "blocked"),
            AgentStatus::Done => write!(f, "done"),
            AgentStatus::Error => write!(f, "error"),
            AgentStatus::Idle => write!(f, "idle"),
            AgentStatus::Custom(s) => write!(f, "{}", s),
        }
    }
}

/// Parsed OSC 7501 event emitted by agent process.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OscEvent {
    pub state: AgentStatus,
    pub message: String,
    pub metadata: HashMap<String, String>,
    pub timestamp_ms: u64,
}

#[derive(Debug, PartialEq, Eq)]
enum ParserState {
    Normal,
    SawEsc,
    SawOscPrefix { prefix_buf: Vec<u8> },
    In7501 { payload_buf: Vec<u8> },
    In7501SawEsc { payload_buf: Vec<u8> },
}

pub const MAX_OSC_PAYLOAD_LEN: usize = 16 * 1024; // 16 KB safety cap

/// Streaming parser for OSC 7501 escape sequences:
/// `\x1b]7501;state=<state>;msg=<msg>\x07` or `\x1b]7501;state=<state>;msg=<msg>\x1b\`
#[derive(Debug)]
pub struct OscParser {
    state: ParserState,
    strip_from_output: bool,
}

impl Default for OscParser {
    fn default() -> Self {
        Self::new(true)
    }
}

impl OscParser {
    pub fn new(strip_from_output: bool) -> Self {
        Self {
            state: ParserState::Normal,
            strip_from_output,
        }
    }

    /// Feeds input bytes from terminal PTY stream.
    /// Returns:
    /// - Vector of detected `OscEvent`s.
    /// - Output byte buffer (clean terminal stream with OSC 7501 removed if `strip_from_output` is true).
    pub fn feed(&mut self, input: &[u8]) -> (Vec<OscEvent>, Vec<u8>) {
        let mut events = Vec::new();
        let mut clean_output = Vec::with_capacity(input.len());

        for &b in input {
            match &mut self.state {
                ParserState::Normal => {
                    if b == 0x1b {
                        self.state = ParserState::SawEsc;
                    } else {
                        clean_output.push(b);
                    }
                }
                ParserState::SawEsc => {
                    if b == b']' {
                        // Start of potential OSC sequence: \x1b]
                        self.state = ParserState::SawOscPrefix {
                            prefix_buf: Vec::new(),
                        };
                    } else {
                        // Not an OSC sequence, replay ESC and this byte
                        clean_output.push(0x1b);
                        clean_output.push(b);
                        self.state = ParserState::Normal;
                    }
                }
                ParserState::SawOscPrefix { prefix_buf } => {
                    if b == b';' {
                        // Check if the identifier is "7501"
                        if prefix_buf.as_slice() == b"7501" {
                            self.state = ParserState::In7501 {
                                payload_buf: Vec::new(),
                            };
                        } else {
                            // Non-7501 OSC sequence (e.g. \x1b]0;title\x07).
                            // Emit raw bytes so xterm or terminal can handle it
                            clean_output.push(0x1b);
                            clean_output.push(b']');
                            clean_output.extend_from_slice(prefix_buf);
                            clean_output.push(b';');
                            self.state = ParserState::Normal;
                        }
                    } else if b.is_ascii_digit() && prefix_buf.len() < 10 {
                        prefix_buf.push(b);
                    } else {
                        // Invalid OSC code prefix, flush and reset
                        clean_output.push(0x1b);
                        clean_output.push(b']');
                        clean_output.extend_from_slice(prefix_buf);
                        clean_output.push(b);
                        self.state = ParserState::Normal;
                    }
                }
                ParserState::In7501 { payload_buf } => {
                    if payload_buf.len() >= MAX_OSC_PAYLOAD_LEN {
                        // Exceeded 16KB payload safety limit: guard against unbounded memory bombs
                        clean_output.push(0x1b);
                        clean_output.push(b']');
                        clean_output.extend_from_slice(b"7501;");
                        clean_output.extend_from_slice(payload_buf);
                        clean_output.push(b);
                        self.state = ParserState::Normal;
                    } else if b == 0x07 {
                        // BEL terminator: end of OSC 7501 sequence
                        if let Some(event) = Self::parse_payload(payload_buf) {
                            events.push(event);
                        }
                        if !self.strip_from_output {
                            clean_output.push(0x1b);
                            clean_output.push(b']');
                            clean_output.extend_from_slice(b"7501;");
                            clean_output.extend_from_slice(payload_buf);
                            clean_output.push(0x07);
                        }
                        self.state = ParserState::Normal;
                    } else if b == 0x1b {
                        // Potential ST terminator: \x1b\
                        let buf = std::mem::take(payload_buf);
                        self.state = ParserState::In7501SawEsc { payload_buf: buf };
                    } else {
                        payload_buf.push(b);
                    }
                }
                ParserState::In7501SawEsc { payload_buf } => {
                    if b == b'\\' {
                        // ST terminator completed: \x1b\
                        if let Some(event) = Self::parse_payload(payload_buf) {
                            events.push(event);
                        }
                        if !self.strip_from_output {
                            clean_output.push(0x1b);
                            clean_output.push(b']');
                            clean_output.extend_from_slice(b"7501;");
                            clean_output.extend_from_slice(payload_buf);
                            clean_output.push(0x1b);
                            clean_output.push(b'\\');
                        }
                        self.state = ParserState::Normal;
                    } else {
                        // False alarm, put back ESC and current byte into payload
                        payload_buf.push(0x1b);
                        payload_buf.push(b);
                        let buf = std::mem::take(payload_buf);
                        self.state = ParserState::In7501 { payload_buf: buf };
                    }
                }
            }
        }

        (events, clean_output)
    }

    /// Parses key-value payload: `state=working;msg=Analyzing repo;step=1`
    fn parse_payload(payload_bytes: &[u8]) -> Option<OscEvent> {
        let payload_str = String::from_utf8_lossy(payload_bytes);
        let mut state = AgentStatus::Idle;
        let mut message = String::new();
        let mut metadata = HashMap::new();

        for part in payload_str.split(';') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some((k, v)) = part.split_once('=') {
                let key = k.trim().to_ascii_lowercase();
                let value = v.trim();
                match key.as_str() {
                    "state" => state = AgentStatus::from(value),
                    "msg" | "message" => message = value.to_string(),
                    _ => {
                        metadata.insert(key, value.to_string());
                    }
                }
            }
        }

        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Some(OscEvent {
            state,
            message,
            metadata,
            timestamp_ms,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_bel_terminated() {
        let mut parser = OscParser::new(true);
        let input = b"Hello \x1b]7501;state=working;msg=Scanning files\x07World\n";
        let (events, clean) = parser.feed(input);

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].state, AgentStatus::Working);
        assert_eq!(events[0].message, "Scanning files");
        assert_eq!(String::from_utf8_lossy(&clean), "Hello World\n");
    }

    #[test]
    fn test_parse_st_terminated() {
        let mut parser = OscParser::new(true);
        let input = b"\x1b]7501;state=blocked;msg=Needs human approval\x1b\\Next line";
        let (events, clean) = parser.feed(input);

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].state, AgentStatus::Blocked);
        assert_eq!(events[0].message, "Needs human approval");
        assert_eq!(String::from_utf8_lossy(&clean), "Next line");
    }

    #[test]
    fn test_split_across_chunks() {
        let mut parser = OscParser::new(true);
        let chunk1 = b"Prefix \x1b]7501;state=";
        let chunk2 = b"done;msg=All tests pass";
        let chunk3 = b"ed\x07 Suffix";

        let (e1, c1) = parser.feed(chunk1);
        assert!(e1.is_empty());
        assert_eq!(String::from_utf8_lossy(&c1), "Prefix ");

        let (e2, c2) = parser.feed(chunk2);
        assert!(e2.is_empty());
        assert!(c2.is_empty());

        let (e3, c3) = parser.feed(chunk3);
        assert_eq!(e3.len(), 1);
        assert_eq!(e3[0].state, AgentStatus::Done);
        assert_eq!(e3[0].message, "All tests passed");
        assert_eq!(String::from_utf8_lossy(&c3), " Suffix");
    }

    #[test]
    fn test_ignore_other_osc() {
        let mut parser = OscParser::new(true);
        let input = b"\x1b]0;My Window Title\x07Console Output";
        let (events, clean) = parser.feed(input);
        assert!(events.is_empty());
        assert_eq!(String::from_utf8_lossy(&clean), "\x1b]0;My Window Title\x07Console Output");
    }

    #[test]
    fn test_custom_metadata() {
        let mut parser = OscParser::new(true);
        let input = b"\x1b]7501;state=working;msg=Compile;step=3;target=release\x07";
        let (events, _) = parser.feed(input);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].state, AgentStatus::Working);
        assert_eq!(events[0].metadata.get("step").unwrap(), "3");
        assert_eq!(events[0].metadata.get("target").unwrap(), "release");
    }

    #[test]
    fn test_payload_bomb_bounded() {
        let mut parser = OscParser::new(true);
        let mut huge_payload = Vec::new();
        huge_payload.extend_from_slice(b"\x1b]7501;state=working;msg=");
        huge_payload.resize(huge_payload.len() + MAX_OSC_PAYLOAD_LEN + 100, b'A');
        huge_payload.push(0x07);

        let (events, clean) = parser.feed(&huge_payload);
        // Exceeded limit: rejected
        assert!(events.is_empty());
        assert!(!clean.is_empty());
    }
}
