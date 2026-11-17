import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WorkspaceState } from '../types';

export type LifecycleState =
  | 'CODING'
  | 'PLANNING'
  | 'TESTING'
  | 'NEEDS_REVIEW'
  | 'REPORTING'
  | 'NEEDS_INPUT'
  | 'OUT_OF_TOKENS'
  | 'EXHAUSTED'
  | 'COMPACTING'
  | 'IDLE';

export const LIFECYCLE: Record<
  LifecycleState,
  { badge: string; color: string; label: string; zone: 'desk' | 'holo' | 'pod' }
> = {
  CODING: { badge: 'EDIT', color: '#34D399', label: 'Coding', zone: 'desk' },
  PLANNING: { badge: 'PLAN', color: '#A78BFA', label: 'Planning', zone: 'holo' },
  TESTING: { badge: 'TEST', color: '#2DD4BF', label: 'Testing', zone: 'desk' },
  NEEDS_REVIEW: { badge: 'REVIEW!', color: '#D4AF37', label: 'Needs Review', zone: 'holo' },
  REPORTING: { badge: 'REPORT', color: '#38BDF8', label: 'Reporting', zone: 'desk' },
  NEEDS_INPUT: { badge: 'INPUT!', color: '#FB7185', label: 'Needs Input', zone: 'desk' },
  OUT_OF_TOKENS: { badge: '0 TOKENS', color: '#EF4444', label: 'Out of Tokens', zone: 'desk' },
  EXHAUSTED: { badge: '429 RATE', color: '#F97316', label: '429 Rate Limit', zone: 'pod' },
  COMPACTING: { badge: 'COMPACT', color: '#94A3B8', label: 'Compacting', zone: 'desk' },
  IDLE: { badge: 'IDLE', color: '#64748B', label: 'Idle', zone: 'pod' },
};

export interface OrbitalAgent {
  id: string;
  shortName: string;
  sessionName: string;
  role: string;
  crown: boolean;
  accent: string;
  visor: string;
  roomId: string | null;
  deskIdx: number;
  state: LifecycleState;
  tokenPct: number;
  toolCall: string;
  speech: string | null;
  speechColor: string;
  speechTimer: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  walkingHandoff: boolean;
}

interface OrbitalCanvasDeckProps {
  workspaces: Record<string, WorkspaceState>;
  activeRoomId: string;
  focusedSessionId: string | null;
  leadSessionId: string | null;
  ecoModeFps: 15 | 60;
  onFocusSession: (sessionId: string) => void;
  onAgentStateChange?: (sessionId: string, state: LifecycleState) => void;
  onHandoffTriggered?: (senderName: string, receiverName: string) => void;
  handoffTriggerKey?: number;
}

const AGENT_COLORS: Record<string, { accent: string; visor: string }> = {
  'claude-code': { accent: '#D4AF37', visor: '#FDE047' },
  claude: { accent: '#D4AF37', visor: '#FDE047' },
  antigravity: { accent: '#38BDF8', visor: '#38BDF8' },
  agy: { accent: '#38BDF8', visor: '#38BDF8' },
  gemini: { accent: '#34D399', visor: '#34D399' },
  codex: { accent: '#A78BFA', visor: '#C4B5FD' },
  hermes: { accent: '#FB7185', visor: '#FB7185' },
  terminal: { accent: '#94A3B8', visor: '#CBD5E1' },
};

export const OrbitalCanvasDeck: React.FC<OrbitalCanvasDeckProps> = ({
  workspaces,
  activeRoomId,
  focusedSessionId,
  leadSessionId,
  ecoModeFps,
  onFocusSession,
  onAgentStateChange,
  onHandoffTriggered,
  handoffTriggerKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const agentsRef = useRef<OrbitalAgent[]>([]);
  const bgCacheRef = useRef<HTMLCanvasElement | null>(null);
  const lastBgKeyRef = useRef<string>('');

  const [tooltipData, setTooltipData] = useState<{
    visible: boolean;
    agent: OrbitalAgent | null;
    x: number;
    y: number;
  }>({ visible: false, agent: null, x: 0, y: 0 });

  const beamsRef = useRef<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    progress: number;
    life: number;
  }[]>([]);

  const popupsRef = useRef<{
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
  }[]>([]);

  const tickRef = useRef<number>(0);
  const lastRenderTsRef = useRef<number>(0);
  const hoveredAgentIdRef = useRef<string | null>(null);

  const dragRef = useRef<{
    agentId: string | null;
    active: boolean;
    startX: number;
    startY: number;
  }>({ agentId: null, active: false, startX: 0, startY: 0 });

  const geoRef = useRef<{
    wallH: number;
    holoCenter: { x: number; y: number };
    holoSpots: { x: number; y: number }[];
    deskSlots: { x: number; y: number }[];
    podY: number;
    podH: number;
    pods: { x: number; y: number; w: number; h: number; seatX: number; seatY: number }[];
  }>({
    wallH: 44,
    holoCenter: { x: 87, y: 72 },
    holoSpots: [],
    deskSlots: [],
    podY: 244,
    podH: 28,
    pods: [],
  });

  const dimsRef = useRef<{ LW: number; LH: number; renderScale: number }>({
    LW: 175,
    LH: 280,
    renderScale: 2,
  });

  // Convert real workspace state to OrbitalAgent model
  const syncAgentsFromWorkspaces = useCallback(() => {
    const list = Object.values(workspaces);
    const existingMap = new Map(agentsRef.current.map((a) => [a.id, a]));

    const updated: OrbitalAgent[] = list.map((ws, index) => {
      const existing = existingMap.get(ws.id);
      const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;
      const typeKey = (ws.agentType?.toLowerCase() || 'terminal').split(/[\s-]/)[0];
      const colors = AGENT_COLORS[typeKey] || AGENT_COLORS.terminal;

      let lifecycleState: LifecycleState = 'CODING';
      const statusMsg = ws.agentStatus?.message?.toLowerCase() || '';

      if (ws.agentStatus?.state === 'blocked') {
        if (statusMsg.includes('input') || statusMsg.includes('approv') || statusMsg.includes('perm')) {
          lifecycleState = 'NEEDS_INPUT';
        } else if (statusMsg.includes('review') || statusMsg.includes('pr')) {
          lifecycleState = 'NEEDS_REVIEW';
        } else if (statusMsg.includes('429') || statusMsg.includes('rate') || statusMsg.includes('limit')) {
          lifecycleState = 'EXHAUSTED';
        } else if (statusMsg.includes('token') || statusMsg.includes('context')) {
          lifecycleState = 'OUT_OF_TOKENS';
        } else {
          lifecycleState = 'NEEDS_INPUT';
        }
      } else if (ws.agentStatus?.state === 'working') {
        if (statusMsg.includes('test') || statusMsg.includes('check')) {
          lifecycleState = 'TESTING';
        } else if (statusMsg.includes('plan') || statusMsg.includes('architect')) {
          lifecycleState = 'PLANNING';
        } else {
          lifecycleState = 'CODING';
        }
      } else if (ws.agentStatus?.state === 'done') {
        lifecycleState = 'REPORTING';
      } else if (statusMsg.includes('compact')) {
        lifecycleState = 'COMPACTING';
      } else {
        lifecycleState = 'IDLE';
      }

      const deskIdx = existing ? existing.deskIdx : index % 6;
      const x = existing ? existing.x : 40 + (index % 2) * 80;
      const y = existing ? existing.y : 100 + Math.floor(index / 2) * 40;

      return {
        id: ws.id,
        shortName: `@${ws.name.replace(/\s+/g, '-').slice(0, 10).toLowerCase()}`,
        sessionName: ws.name,
        role: ws.agentRole || (isLead ? 'Lead Architect' : `${ws.agentType || 'shell'} worker`),
        crown: isLead,
        accent: colors.accent,
        visor: colors.visor,
        roomId: ws.roomId || 'room-1',
        deskIdx,
        state: existing?.state && existing.state !== 'IDLE' && lifecycleState === 'IDLE' ? existing.state : lifecycleState,
        tokenPct: existing ? existing.tokenPct : Math.max(20, Math.min(96, 92 - index * 6)),
        toolCall: ws.agentStatus?.message || (ws.sessionMode === 'branch' ? `Branch: ${ws.branch}` : `Path: ${ws.worktreePath}`),
        speech: existing?.speech || null,
        speechColor: existing?.speechColor || colors.accent,
        speechTimer: existing?.speechTimer || 0,
        x,
        y,
        tx: existing ? existing.tx : x,
        ty: existing ? existing.ty : y,
        walkingHandoff: existing ? existing.walkingHandoff : false,
      };
    });

    agentsRef.current = updated;
  }, [workspaces, leadSessionId]);

  useEffect(() => {
    syncAgentsFromWorkspaces();
  }, [syncAgentsFromWorkspaces]);

  // Geometry calculation for the orbital room
  const computeOrbitalGeometry = (w: number, h: number) => {
    const wallH = Math.max(40, Math.round(h * 0.15));
    const podH = Math.max(26, Math.round(h * 0.105));
    const podY = h - podH - 6;
    const holoY = wallH + Math.max(24, Math.round((podY - wallH) * 0.14));
    const cx = Math.round(w / 2);

    const holoSpots = [
      { x: cx - 26, y: holoY },
      { x: cx + 26, y: holoY },
      { x: cx - 16, y: holoY + 13 },
      { x: cx + 16, y: holoY + 13 },
    ];

    const workTop = holoY + 28;
    const workBot = podY - 14;
    const rowSpan = Math.max(36, Math.floor((workBot - workTop) / 3));
    const leftX = Math.max(34, Math.round(w * 0.23));
    const rightX = Math.min(w - 34, Math.round(w * 0.77));

    const deskSlots = [
      { x: leftX, y: workTop },
      { x: rightX, y: workTop },
      { x: leftX, y: workTop + rowSpan },
      { x: rightX, y: workTop + rowSpan },
      { x: leftX, y: workTop + rowSpan * 2 },
      { x: rightX, y: workTop + rowSpan * 2 },
    ];

    const podMargin = 8;
    const podGap = 5;
    const podW = Math.floor((w - podMargin * 2 - podGap * 3) / 4);
    const pods = [0, 1, 2, 3].map((i) => {
      const pxLeft = podMargin + i * (podW + podGap);
      return {
        x: pxLeft,
        y: podY,
        w: podW,
        h: podH,
        seatX: Math.round(pxLeft + podW / 2),
        seatY: Math.round(podY + podH * 0.62),
      };
    });

    geoRef.current = {
      wallH,
      holoCenter: { x: cx, y: holoY },
      holoSpots,
      deskSlots,
      podY,
      podH,
      pods,
    };

    // Update agent targets
    agentsRef.current.forEach((ag) => {
      if (!ag.roomId || (dragRef.current.active && dragRef.current.agentId === ag.id)) return;
      const target = getZoneTargetForAgent(ag);
      ag.tx = target.x;
      ag.ty = target.y;
      if (!ag.walkingHandoff) {
        ag.x = target.x;
        ag.y = target.y;
      }
    });

    lastBgKeyRef.current = '';
  };

  const getZoneTargetForAgent = (ag: OrbitalAgent) => {
    const meta = LIFECYCLE[ag.state] || LIFECYCLE.CODING;
    const geo = geoRef.current;
    if (meta.zone === 'holo' && geo.holoSpots.length > 0) {
      return geo.holoSpots[ag.deskIdx % geo.holoSpots.length];
    }
    if (meta.zone === 'pod' && geo.pods.length > 0) {
      const pod = geo.pods[ag.deskIdx % geo.pods.length];
      return { x: pod.seatX, y: pod.seatY };
    }
    if (geo.deskSlots.length > 0) {
      return geo.deskSlots[ag.deskIdx % geo.deskSlots.length];
    }
    return { x: Math.round(dimsRef.current.LW / 2), y: Math.round(dimsRef.current.LH / 2) };
  };

  // Pre-bake static deck background
  const bakeStaticDeck = (W: number, H: number, visibleDesks: number) => {
    if (!bgCacheRef.current) {
      bgCacheRef.current = document.createElement('canvas');
    }
    const bgCanvas = bgCacheRef.current;
    bgCanvas.width = W;
    bgCanvas.height = H;
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return;

    const geo = geoRef.current;
    bgCtx.clearRect(0, 0, W, H);

    // 1. Titanium deck tiles
    const tile = 12;
    for (let y = geo.wallH; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const alt = ((x / tile) + (y / tile)) % 2 === 0;
        bgCtx.fillStyle = alt ? '#121521' : '#151927';
        bgCtx.fillRect(x, y, tile, tile);
        bgCtx.fillStyle = 'rgba(148, 163, 184, 0.12)';
        bgCtx.fillRect(x + 1, y + 1, 1, 1);
      }
    }

    // Glowing cyan & gold orbital power conduits
    const cx = Math.round(W / 2);
    bgCtx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    bgCtx.fillRect(cx - 28, geo.wallH + 2, 1, geo.podY - geo.wallH - 4);
    bgCtx.fillRect(cx + 28, geo.wallH + 2, 1, geo.podY - geo.wallH - 4);
    bgCtx.fillStyle = 'rgba(212, 175, 55, 0.3)';
    bgCtx.fillRect(6, geo.podY - 4, W - 12, 1);

    // 2. North panoramic bulkhead wall
    bgCtx.fillStyle = '#0B0D15';
    bgCtx.fillRect(0, 0, W, geo.wallH);
    bgCtx.fillStyle = '#D4AF37';
    bgCtx.fillRect(0, geo.wallH - 2, W, 2);

    const sideW = Math.max(32, Math.round(W * 0.21));
    const winX = sideW + 6;
    const winW = W - (sideW + 6) * 2;
    const panelH = geo.wallH - 8;

    // Left Bulkhead Frame: Live CTX Panel
    bgCtx.fillStyle = '#161926';
    bgCtx.fillRect(4, 4, sideW, panelH);
    bgCtx.strokeStyle = '#2B2F42';
    bgCtx.strokeRect(4.5, 4.5, sideW - 1, panelH - 1);

    // Center Panoramic Space Viewport
    bgCtx.fillStyle = '#05070E';
    bgCtx.fillRect(winX, 4, winW, panelH);
    bgCtx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    bgCtx.fillRect(winX + 4, 9, Math.round(winW * 0.55), Math.round(panelH * 0.45));
    bgCtx.fillStyle = 'rgba(167, 139, 250, 0.09)';
    bgCtx.fillRect(winX + Math.round(winW * 0.35), 14, Math.round(winW * 0.5), Math.round(panelH * 0.42));

    // Exoplanet
    const planetX = winX + Math.max(12, winW - 22);
    const planetY = 12;
    bgCtx.fillStyle = '#38BDF8';
    bgCtx.fillRect(planetX, planetY, 10, 10);
    bgCtx.fillStyle = '#0284C7';
    bgCtx.fillRect(planetX + 2, planetY + 2, 6, 6);
    bgCtx.fillStyle = '#D4AF37';
    bgCtx.fillRect(planetX - 4, planetY + 4, 18, 2);

    // Mullions
    bgCtx.fillStyle = '#1E2233';
    bgCtx.fillRect(winX + Math.round(winW * 0.33), 4, 1, panelH);
    bgCtx.fillRect(winX + Math.round(winW * 0.67), 4, 1, panelH);

    // Right Bulkhead Frame: Live MESH Panel
    const rightPanelX = W - sideW - 4;
    bgCtx.fillStyle = '#161926';
    bgCtx.fillRect(rightPanelX, 4, sideW, panelH);
    bgCtx.strokeStyle = '#2B2F42';
    bgCtx.strokeRect(rightPanelX + 0.5, 4.5, sideW - 1, panelH - 1);

    // 3. Command Table
    const hc = geo.holoCenter;
    bgCtx.save();
    bgCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    bgCtx.beginPath();
    bgCtx.ellipse(hc.x, hc.y + 3, 24, 10, 0, 0, Math.PI * 2);
    bgCtx.fill();

    bgCtx.fillStyle = '#1C1E2A';
    bgCtx.beginPath();
    bgCtx.ellipse(hc.x, hc.y, 22, 9, 0, 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.strokeStyle = '#D4AF37';
    bgCtx.lineWidth = 1;
    bgCtx.stroke();

    bgCtx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    bgCtx.beginPath();
    bgCtx.ellipse(hc.x, hc.y, 14, 5.5, 0, 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.restore();

    // 4. Executive Workstations
    for (let i = 0; i < visibleDesks; i++) {
      const slot = geo.deskSlots[i];
      if (!slot) continue;
      const dx = slot.x - 22;
      const dy = slot.y - 13;

      bgCtx.fillStyle = 'rgba(0,0,0,0.4)';
      bgCtx.fillRect(dx + 2, dy + 11, 40, 10);
      bgCtx.fillStyle = '#262938';
      bgCtx.fillRect(dx, dy + 9, 44, 9);
      bgCtx.fillStyle = '#D4AF37';
      bgCtx.fillRect(dx, dy + 9, 44, 1);
      bgCtx.fillStyle = '#141724';
      bgCtx.fillRect(dx + 2, dy + 18, 2, 5);
      bgCtx.fillRect(dx + 40, dy + 18, 2, 5);

      bgCtx.fillStyle = '#090B12';
      bgCtx.fillRect(dx + 5, dy, 15, 9);
      bgCtx.fillStyle = '#101524';
      bgCtx.fillRect(dx + 6, dy + 1, 13, 7);
      bgCtx.fillStyle = '#090B12';
      bgCtx.fillRect(dx + 24, dy, 15, 9);
      bgCtx.fillStyle = '#101524';
      bgCtx.fillRect(dx + 25, dy + 1, 13, 7);

      bgCtx.fillStyle = '#0F172A';
      bgCtx.fillRect(dx + 15, dy + 12, 14, 2);
      bgCtx.fillStyle = '#38BDF8';
      bgCtx.fillRect(dx + 2, dy + 6, 2, 3);
    }

    // 5. Recharge Pods
    geo.pods.forEach((pod) => {
      bgCtx.fillStyle = '#161926';
      bgCtx.fillRect(pod.x, pod.y, pod.w, pod.h);
      bgCtx.strokeStyle = '#2B2F42';
      bgCtx.strokeRect(pod.x + 0.5, pod.y + 0.5, pod.w - 1, pod.h - 1);
      bgCtx.fillStyle = '#38BDF8';
      bgCtx.fillRect(pod.x + 2, pod.y + 1, pod.w - 4, 1);
      bgCtx.fillStyle = '#0E1019';
      bgCtx.fillRect(pod.x + 3, pod.y + 4, pod.w - 6, pod.h - 8);
    });
  };

  // Render loop
  useEffect(() => {
    let animId: number;

    const render = (now: number) => {
      const fps = ecoModeFps || 15;
      const interval = 1000 / fps;

      if (now - lastRenderTsRef.current >= interval) {
        tickRef.current++;
        const tick = tickRef.current;
        const geo = geoRef.current;
        const { LW, LH, renderScale } = dimsRef.current;

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, LW, LH);

            const occupants = agentsRef.current.filter((a) => a.roomId === activeRoomId);
            const deskPairs = Math.max(1, Math.min(3, Math.ceil(occupants.length / 2)));
            const visibleDesks = deskPairs * 2;

            const cacheKey = `${LW}x${LH}|${visibleDesks}`;
            if (cacheKey !== lastBgKeyRef.current) {
              lastBgKeyRef.current = cacheKey;
              bakeStaticDeck(LW, LH, visibleDesks);
            }

            if (bgCacheRef.current) {
              ctx.drawImage(bgCacheRef.current, 0, 0);
            }

            // Draw North telemetry
            const sideW = Math.max(32, Math.round(LW * 0.21));
            const winX = sideW + 6;
            const winW = LW - (sideW + 6) * 2;
            const panelH = geo.wallH - 8;

            // CTX label & bars
            ctx.fillStyle = '#94A3B8';
            ctx.font = '600 7px monospace';
            ctx.fillText('CTX', 7, 10);
            const barMaxW = sideW - 8;
            for (let i = 0; i < 4; i++) {
              const by = 13 + i * 5;
              ctx.fillStyle = '#0B0D15';
              ctx.fillRect(7, by, barMaxW, 3);
              const ag = occupants[i];
              if (ag) {
                const fillW = Math.max(1, Math.round((ag.tokenPct / 100) * barMaxW));
                const col = ag.tokenPct === 0 ? '#EF4444' : ag.tokenPct < 35 ? '#F97316' : ag.accent;
                ctx.fillStyle = col;
                ctx.fillRect(7, by, fillW, 3);
              }
            }

            // Viewport stars & shuttle
            for (let i = 0; i < 14; i++) {
              const sx = winX + 4 + ((i * 19) % Math.max(8, winW - 8));
              const sy = 7 + ((i * 11) % Math.max(8, panelH - 6));
              const bright = (tick + i * 7) % 28 < 20;
              ctx.fillStyle = bright ? '#F8FAFC' : '#475569';
              ctx.fillRect(sx, sy, 1, 1);
            }
            const shuttleX = winX + 4 + ((tick * 0.35) % Math.max(12, winW - 12));
            const shuttleY = 10 + Math.round(Math.sin(tick * 0.06) * 2);
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(shuttleX, shuttleY, 6, 2);
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(shuttleX - 2, shuttleY, 2, 1);

            // MESH equalizer
            const rx = LW - sideW - 4;
            ctx.fillStyle = '#94A3B8';
            ctx.font = '600 7px monospace';
            ctx.fillText('MESH', rx + 3, 10);
            const eqW = Math.max(3, Math.floor((sideW - 12) / 4));
            for (let ch = 0; ch < 4; ch++) {
              const ag = occupants[ch];
              const isBusy = ag && ['CODING', 'TESTING', 'PLANNING', 'REPORTING'].includes(ag.state);
              const maxH = panelH - 13;
              const level = ag
                ? isBusy
                  ? Math.max(3, Math.round(((Math.sin(tick * 0.25 + ch * 1.7) + 1) / 2) * maxH))
                  : 3
                : 1;
              const col = ag ? LIFECYCLE[ag.state]?.color || '#38BDF8' : '#262938';
              ctx.fillStyle = col;
              ctx.fillRect(rx + 3 + ch * (eqW + 2), 4 + panelH - 3 - level, eqW, level);
            }

            // Command table hologram wireframe
            const bob = Math.round(Math.sin(tick * 0.08) * 2);
            ctx.strokeStyle = '#38BDF8';
            ctx.strokeRect(geo.holoCenter.x - 5, geo.holoCenter.y - 14 + bob, 10, 7);
            ctx.strokeStyle = '#D4AF37';
            ctx.strokeRect(geo.holoCenter.x - 3, geo.holoCenter.y - 12 + bob, 6, 3);

            // Monitors & Battery bars
            for (let i = 0; i < visibleDesks; i++) {
              const slot = geo.deskSlots[i];
              const ag = occupants.find((a) => a.deskIdx === i);
              if (!ag || !slot) continue;
              const dx = slot.x - 22;
              const dy = slot.y - 13;
              const meta = LIFECYCLE[ag.state] || LIFECYCLE.CODING;

              // Battery bar
              ctx.fillStyle = '#090B12';
              ctx.fillRect(dx + 24, dy - 3, 15, 2);
              if (ag.tokenPct > 0) {
                const bw = Math.max(1, Math.round((ag.tokenPct / 100) * 15));
                ctx.fillStyle = ag.tokenPct < 35 ? '#F97316' : '#34D399';
                ctx.fillRect(dx + 24, dy - 3, bw, 2);
              }

              // OLED screen text lines
              const shift = Math.floor(tick / 8) % 3;
              for (let l = 0; l < 3; l++) {
                const ly = dy + 2 + ((l + shift) % 3) * 2;
                ctx.fillStyle = meta.color;
                ctx.fillRect(dx + 7, ly, 6 + ((l * 3) % 5), 1);
                ctx.fillStyle = l === 1 ? '#F8FAFC' : meta.color;
                ctx.fillRect(dx + 26, ly, 6 + ((l * 4) % 5), 1);
              }
            }

            // Signal Beams
            beamsRef.current.forEach((b) => {
              const cx = b.x1 + (b.x2 - b.x1) * b.progress;
              const cy = b.y1 + (b.y2 - b.y1) * b.progress - Math.sin(b.progress * Math.PI) * 14;
              ctx.save();
              ctx.strokeStyle = b.color;
              ctx.globalAlpha = Math.min(1, b.life / 25) * 0.65;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.moveTo(b.x1, b.y1);
              ctx.quadraticCurveTo((b.x1 + b.x2) / 2, Math.min(b.y1, b.y2) - 16, cx, cy);
              ctx.stroke();
              ctx.restore();
              ctx.fillStyle = '#F8FAFC';
              ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
            });

            // Update agent positions
            occupants.forEach((ag) => {
              if (ag.speechTimer > 0) {
                ag.speechTimer--;
                if (ag.speechTimer === 0) ag.speech = null;
              }
              const dx = ag.tx - ag.x;
              const dy = ag.ty - ag.y;
              const dist = Math.hypot(dx, dy);
              if (dist > 1) {
                const spd = ag.walkingHandoff ? 1.15 : 0.85;
                ag.x += (dx / dist) * spd;
                ag.y += (dy / dist) * spd;
              } else {
                ag.x = ag.tx;
                ag.y = ag.ty;
              }
            });

            // Draw Dewwie Chibi Sprites
            const sorted = [...occupants].sort((a, b) => a.y - b.y);
            sorted.forEach((ag) => {
              const x = Math.round(ag.x);
              const y = Math.round(ag.y);
              const isFocused = ag.id === focusedSessionId;
              const isHovered = ag.id === hoveredAgentIdRef.current;

              const moving = Math.hypot(ag.tx - ag.x, ag.ty - ag.y) > 1.2;
              const typing = ['CODING', 'TESTING', 'REPORTING'].includes(ag.state);
              const bob = moving
                ? Math.round(Math.sin(tick * 0.45) * 2)
                : typing
                ? Math.floor(tick / 5) % 2
                : Math.floor(tick / 22) % 2;

              // Selection ring
              if (isFocused || isHovered) {
                ctx.save();
                ctx.strokeStyle = isFocused ? '#D4AF37' : '#38BDF8';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.ellipse(x, y + 4, 10, 4.2, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
              }

              // Shadow
              ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.beginPath();
              ctx.ellipse(x, y + 4, 6, 2.5, 0, 0, Math.PI * 2);
              ctx.fill();

              const by = y - bob;
              const stride = moving ? Math.round(Math.sin(tick * 0.45) * 2) : 0;
              ctx.fillStyle = '#0B0C12';
              ctx.fillRect(x - 4, by + 1 + stride, 3, 3);
              ctx.fillRect(x + 1, by + 1 - stride, 3, 3);

              // Torso
              ctx.fillStyle = '#334155';
              ctx.fillRect(x - 4, by - 5, 8, 6);
              ctx.fillStyle = '#94A3B8';
              ctx.fillRect(x - 3, by - 5, 6, 5);
              ctx.fillStyle = ag.accent;
              ctx.fillRect(x - 1, by - 4, 2, 3);

              // Arms
              const armShift = typing ? (Math.floor(tick / 4) % 2 === 0 ? -2 : 1) : 0;
              ctx.fillStyle = '#CBD5E1';
              ctx.fillRect(x - 6, by - 4 + armShift, 2, 4);
              ctx.fillRect(x + 4, by - 4 - armShift, 2, 4);

              // Head
              ctx.fillStyle = '#475569';
              ctx.fillRect(x - 6, by - 13, 12, 8);
              ctx.fillStyle = '#CBD5E1';
              ctx.fillRect(x - 5, by - 13, 10, 7);
              ctx.fillStyle = '#F8FAFC';
              ctx.fillRect(x - 5, by - 13, 10, 2);

              // Crown or Crest
              if (ag.crown) {
                ctx.fillStyle = '#D4AF37';
                ctx.fillRect(x - 4, by - 16, 8, 3);
                ctx.fillStyle = '#FDE047';
                ctx.fillRect(x - 4, by - 17, 2, 1);
                ctx.fillRect(x - 1, by - 17, 2, 1);
                ctx.fillRect(x + 2, by - 17, 2, 1);
              } else {
                ctx.fillStyle = ag.accent;
                ctx.fillRect(x - 2, by - 15, 4, 2);
              }

              // Visor
              ctx.fillStyle = '#0B0C12';
              ctx.fillRect(x - 4, by - 10, 8, 2);
              ctx.fillStyle = ag.visor;
              ctx.fillRect(x - 3, by - 10, 6, 2);

              // Name label
              ctx.font = '600 7px monospace';
              ctx.fillStyle = isFocused ? '#D4AF37' : '#E2E8F0';
              ctx.textAlign = 'center';
              ctx.fillText(ag.shortName, x, y + 10.5);

              // Speech bubble
              if (ag.speech) {
                ctx.save();
                ctx.font = '700 8px monospace';
                const tw = ctx.measureText(ag.speech).width;
                const bw = Math.ceil(tw + 8);
                const bh = 13;
                const bx = Math.max(4, Math.min(LW - bw - 4, x - bw / 2));
                const byy = Math.max(geo.wallH + 2, y - 24);

                ctx.fillStyle = 'rgba(11, 12, 18, 0.94)';
                ctx.beginPath();
                ctx.roundRect(bx, byy, bw, bh, 3);
                ctx.fill();
                ctx.strokeStyle = ag.speechColor || '#D4AF37';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = '#F8FAFC';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ag.speech, bx + bw / 2, byy + bh / 2 + 0.5);
                ctx.restore();
              }
            });

            // Popups
            popupsRef.current.forEach((sp) => {
              ctx.save();
              ctx.globalAlpha = Math.max(0, sp.life);
              ctx.font = '700 8px monospace';
              ctx.textAlign = 'center';
              ctx.fillStyle = sp.color;
              ctx.fillText(sp.text, sp.x, sp.y);
              ctx.restore();
            });

            ctx.restore();
          }
        }

        lastRenderTsRef.current = now;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [activeRoomId, focusedSessionId, ecoModeFps]);

  // ResizeObserver for canvas dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const PIXEL_SCALE = 2;
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const LW = Math.max(140, Math.floor(width / PIXEL_SCALE));
          const LH = Math.max(200, Math.floor(height / PIXEL_SCALE));
          const renderScale = PIXEL_SCALE * dpr;

          dimsRef.current = { LW, LH, renderScale };

          if (canvasRef.current) {
            canvasRef.current.width = LW * renderScale;
            canvasRef.current.height = LH * renderScale;
          }

          computeOrbitalGeometry(LW, LH);
        }
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Pointer interactions
  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { lx: 0, ly: 0, rx: 0, ry: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const { LW, LH } = dimsRef.current;
    return {
      lx: ((e.clientX - rect.left) / rect.width) * LW,
      ly: ((e.clientY - rect.top) / rect.height) * LH,
      rx: e.clientX - rect.left,
      ry: e.clientY - rect.top,
    };
  };

  const hitTestAgent = (lx: number, ly: number) => {
    const occ = agentsRef.current.filter((a) => a.roomId === activeRoomId);
    for (let i = occ.length - 1; i >= 0; i--) {
      const ag = occ[i];
      if (Math.abs(lx - ag.x) <= 12 && ly >= ag.y - 18 && ly <= ag.y + 10) {
        return ag;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { lx, ly } = toLogical(e);
    const hit = hitTestAgent(lx, ly);
    if (hit) {
      dragRef.current = {
        agentId: hit.id,
        active: false,
        startX: lx,
        startY: ly,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { lx, ly, rx, ry } = toLogical(e);

    if (dragRef.current.agentId) {
      if (Math.hypot(lx - dragRef.current.startX, ly - dragRef.current.startY) > 3) {
        dragRef.current.active = true;
        const ag = agentsRef.current.find((a) => a.id === dragRef.current.agentId);
        if (ag) {
          ag.x = Math.max(12, Math.min(dimsRef.current.LW - 12, lx));
          ag.y = Math.max(geoRef.current.wallH + 14, Math.min(dimsRef.current.LH - 10, ly));
          ag.speech = 'MOVE';
          ag.speechColor = '#D4AF37';
          ag.speechTimer = 25;
        }
        setTooltipData({ visible: false, agent: null, x: 0, y: 0 });
        return;
      }
    }

    const hit = hitTestAgent(lx, ly);
    hoveredAgentIdRef.current = hit ? hit.id : null;

    if (hit) {
      setTooltipData({
        visible: true,
        agent: hit,
        x: Math.max(80, Math.min(220, rx)),
        y: Math.max(48, ry - 10),
      });
    } else {
      setTooltipData({ visible: false, agent: null, x: 0, y: 0 });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { ly } = toLogical(e);
    if (!dragRef.current.agentId) return;

    const ag = agentsRef.current.find((a) => a.id === dragRef.current.agentId);
    const wasDrag = dragRef.current.active;
    dragRef.current = { agentId: null, active: false, startX: 0, startY: 0 };

    if (!ag) return;

    if (wasDrag) {
      onFocusSession(ag.id);
      const geo = geoRef.current;
      if (ly < geo.holoCenter.y + 20) {
        ag.state = 'PLANNING';
        ag.speech = 'PLANNING';
        ag.speechTimer = 80;
        onAgentStateChange?.(ag.id, 'PLANNING');
      } else if (ly >= geo.podY - 6) {
        ag.state = 'IDLE';
        ag.speech = 'IDLE';
        ag.speechTimer = 80;
        onAgentStateChange?.(ag.id, 'IDLE');
      } else {
        ag.state = 'CODING';
        ag.speech = 'CODING';
        ag.speechTimer = 80;
        onAgentStateChange?.(ag.id, 'CODING');
      }
      return;
    }

    // Single click focuses agent terminal!
    onFocusSession(ag.id);
  };

  const handleDoubleClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { lx, ly } = toLogical(e);
    const hit = hitTestAgent(lx, ly);
    if (!hit) return;

    onFocusSession(hit.id);
    hit.speech = 'OVERDRIVE!';
    hit.speechColor = '#FDE047';
    hit.speechTimer = 90;
    popupsRef.current.push({
      x: hit.x,
      y: hit.y - 20,
      text: 'OVERDRIVE!',
      color: '#FDE047',
      life: 1,
    });
  };

  // External trigger for handoff animation
  useEffect(() => {
    if (!handoffTriggerKey) return;
    const occ = agentsRef.current.filter((a) => a.roomId === activeRoomId);
    if (occ.length < 2) return;

    const sender = occ[0];
    const receiver = occ[1];

    sender.walkingHandoff = true;
    sender.tx = receiver.x + (receiver.x < dimsRef.current.LW / 2 ? 18 : -18);
    sender.ty = receiver.y;
    sender.speech = `SYNC → ${receiver.shortName}`;
    sender.speechColor = sender.accent;
    sender.speechTimer = 100;

    beamsRef.current.push({
      x1: sender.x,
      y1: sender.y - 8,
      x2: receiver.x,
      y2: receiver.y - 8,
      color: sender.accent,
      progress: 0,
      life: 80,
    });

    onHandoffTriggered?.(sender.shortName, receiver.shortName);

    setTimeout(() => {
      receiver.speech = 'ACK · SYNCED';
      receiver.speechColor = receiver.accent;
      receiver.speechTimer = 90;
      popupsRef.current.push({
        x: receiver.x,
        y: receiver.y - 20,
        text: 'SYNCED ✓',
        color: '#34D399',
        life: 1,
      });
      sender.walkingHandoff = false;
      const home = getZoneTargetForAgent(sender);
      sender.tx = home.x;
      sender.ty = home.y;
    }, 1400);
  }, [handoffTriggerKey, activeRoomId, onHandoffTriggered]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className="w-full h-full block cursor-default"
      />

      {/* Hover Tooltip */}
      {tooltipData.visible && tooltipData.agent && (
        <div
          ref={tooltipRef}
          style={{
            left: `${tooltipData.x}px`,
            top: `${tooltipData.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className="absolute pointer-events-none z-30 px-2 py-1.5 rounded-md bg-zinc-950/95 border border-amber-500/80 shadow-2xl font-mono text-[10px] text-zinc-100 max-w-[220px]"
        >
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-zinc-800">
            <span style={{ color: tooltipData.agent.accent }} className="font-bold">
              {tooltipData.agent.shortName}
            </span>
            <span
              style={{ color: LIFECYCLE[tooltipData.agent.state]?.color || '#38BDF8' }}
              className="text-[9px] font-bold"
            >
              {LIFECYCLE[tooltipData.agent.state]?.badge} · {tooltipData.agent.tokenPct}%
            </span>
          </div>
          <div className="text-[9px] text-zinc-400 pt-0.5 truncate">{tooltipData.agent.role}</div>
          <div className="text-[9px] text-zinc-300 font-mono pt-0.5 truncate">{tooltipData.agent.toolCall}</div>
        </div>
      )}
    </div>
  );
};
