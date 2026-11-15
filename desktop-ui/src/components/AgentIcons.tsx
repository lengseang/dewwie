import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const TerminalAgentIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 4.5L7 8L3 11.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 12H13"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const ClaudeAgentIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Claude crab/bot signature silhouette in coral */}
    <rect x="3" y="4" width="10" height="7" rx="1.5" fill="#D97706" />
    <path d="M1 6.5H3M13 6.5H15M2 11H3.5M12.5 11H14M4.5 11V13M11.5 11V13" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="6" cy="7.5" r="1" fill="#18181B" />
    <circle cx="10" cy="7.5" r="1" fill="#18181B" />
  </svg>
);

export const CodexAgentIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect x="2.5" y="2.5" width="11" height="11" rx="3" fill="#3B82F6" />
    <circle cx="8" cy="8" r="3" stroke="#FFFFFF" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="1.25" fill="#FFFFFF" />
  </svg>
);

export const GeminiAgentIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M8 1.5C8 5 5 8 1.5 8C5 8 8 11 8 14.5C8 11 11 8 14.5 8C11 8 8 5 8 1.5Z"
      fill="#E4E4E7"
    />
  </svg>
);

export const AntigravityAgentIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="agy-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="50%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
    </defs>
    {/* Rainbow Arch 'A' silhouette from Herdr screenshot */}
    <path
      d="M3 13.5L8 2.5L13 13.5M5 10H11"
      stroke="url(#agy-grad)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HermesAgentIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 7C3 4.23858 5.23858 2 8 2C10.7614 2 13 4.23858 13 7V12.5C13 13.3284 12.3284 14 11.5 14H4.5C3.67157 14 3 13.3284 3 12.5V7Z"
      stroke="#A1A1AA"
      strokeWidth="1.5"
    />
    <path d="M1 5L3 7L1 9M15 5L13 7L15 9" stroke="#E4E4E7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function getAgentIcon(agentType?: string, className?: string, size?: number) {
  const norm = (agentType || '').toLowerCase();
  if (norm.includes('claude')) return <ClaudeAgentIcon className={className} size={size} />;
  if (norm.includes('codex') || norm.includes('openai')) return <CodexAgentIcon className={className} size={size} />;
  if (norm.includes('gemini')) return <GeminiAgentIcon className={className} size={size} />;
  if (norm.includes('antigravity') || norm.includes('agy')) return <AntigravityAgentIcon className={className} size={size} />;
  if (norm.includes('hermes')) return <HermesAgentIcon className={className} size={size} />;
  return <TerminalAgentIcon className={className} size={size} />;
}
