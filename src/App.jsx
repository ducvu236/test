import React, { useState, useRef, useEffect, useCallback } from "react";
import { saveDiagram, getAllDiagrams, deleteDiagram, saveMeta, getMeta } from "./db.js";

const NODE_TYPES = {
  start: { label: "Bắt đầu", shape: "pill", border: "#2F6E4F", bg: "#EAF4EC", w: 140, h: 54 },
  end: { label: "Kết thúc", shape: "pill", border: "#8A3B2E", bg: "#F6E9E4", w: 140, h: 54 },
  process: { label: "Bước xử lý", shape: "rect", border: "#12233F", bg: "#F6F2E7", w: 170, h: 66 },
  decision: { label: "Điều kiện", shape: "diamond", border: "#B4780F", bg: "#FBF0DA", w: 190, h: 100 },
  io: { label: "Dữ liệu vào/ra", shape: "parallelogram", border: "#2E5F8A", bg: "#E7F0F8", w: 180, h: 66 },
};

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function borderPoint(cx, cy, hw, hh, tx, ty) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function autoLayout(nodes, edges) {
  const incoming = {};
  nodes.forEach((n) => (incoming[n.id] = 0));
  edges.forEach((e) => {
    if (incoming[e.target] !== undefined) incoming[e.target]++;
  });
  const level = {};
  const roots = nodes.filter((n) => incoming[n.id] === 0);
  const queue = roots.map((n) => ({ id: n.id, lvl: 0 }));
  const visited = new Set();
  while (queue.length) {
    const { id, lvl } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    level[id] = Math.max(level[id] || 0, lvl);
    edges
      .filter((e) => e.source === id)
      .forEach((e) => {
        if (!visited.has(e.target)) queue.push({ id: e.target, lvl: lvl + 1 });
      });
  }
  nodes.forEach((n) => {
    if (level[n.id] === undefined) level[n.id] = 0;
  });
  const byLevel = {};
  nodes.forEach((n) => {
    const l = level[n.id];
    byLevel[l] = byLevel[l] || [];
    byLevel[l].push(n);
  });
  const positioned = {};
  Object.keys(byLevel).forEach((l) => {
    byLevel[l].forEach((n, i) => {
      positioned[n.id] = { x: 60 + Number(l) * 240, y: 50 + i * 140 };
    });
  });
  return nodes.map((n) => ({ ...n, x: positioned[n.id].x, y: positioned[n.id].y }));
}

function shapeClipPath(shape) {
  if (shape === "diamond") return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
  if (shape === "parallelogram") return "polygon(14% 0%, 100% 0%, 86% 100%, 0% 100%)";
  return "none";
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function blankTab() {
  return { id: uid("tab"), diagramId: null, name: "Sơ đồ chưa đặt tên", nodes: [], edges: [] };
}

export default function App() {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [savedList, setSavedList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState(null);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [saveStatus, setSaveStatus] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ready, setReady] = useState(false);

  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const sessionTimerRef = useRef(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const nodes = activeTab ? activeTab.nodes : [];
  const edges = activeTab ? activeTab.edges : [];

  useEffect(() => {
    (async () => {
      const [session, diagrams] = await Promise.all([getMeta("session"), getAllDiagrams()]);
      setSavedList(diagrams);
      if (session && Array.isArray(session.tabs) && session.tabs.length > 0) {
        setTabs(session.tabs);
        setActiveTabId(session.activeTabId || session.tabs[0].id);
      } else {
        const t = blankTab();
        setTabs([t]);
        setActiveTabId(t.id);
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = setTimeout(() => {
      saveMeta("session", { tabs, activeTabId }).catch(() => {});
    }, 400);
    return () => clearTimeout(sessionTimerRef.current);
  }, [tabs, activeTabId, ready]);

  const updateNodes = useCallback(
    (fn) => {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, nodes: fn(t.nodes) } : t)));
    },
    [activeTabId]
  );

  const updateEdges = useCallback(
    (fn) => {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, edges: fn(t.edges) } : t)));
    },
    [activeTabId]
  );

  const setTabName = (name) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, name } : t)));
  };

  const switchTab = (id) => {
    setActiveTabId(id);
    setSelectedId(null);
    setConnectMode(false);
    setConnectFrom(null);
    setPan({ x: 0, y: 0 });
    setScale(1);
  };

  const openNewTab = () => {
    const t = blankTab();
    setTabs((prev) => [...prev, t]);
    switchTab(t.id);
  };

  const closeTab = (id, evt) => {
    evt.stopPropagation();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const t = blankTab();
        setActiveTabId(t.id);
        return [t];
      }
      if (activeTabId === id) {
        const newActive = next[Math.max(0, idx - 1)];
        setActiveTabId(newActive.id);
      }
      return next;
    });
  };

  const saveToLibrary = async () => {
    if (!activeTab) return;
    const id = activeTab.diagramId || uid("dg");
    const payload = { id, name: activeTab.name, nodes: activeTab.nodes, edges: activeTab.edges, updatedAt: Date.now() };
    setSaveStatus("Đang lưu...");
    try {
      await saveDiagram(payload);
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, diagramId: id } : t)));
      const list = await getAllDiagrams();
      setSavedList(list);
      setSaveStatus("Đã lưu vào thư viện");
    } catch (e) {
      setSaveStatus("Lỗi khi lưu");
    }
  };

  const openFromLibrary = (diagram) => {
    const existing = tabs.find((t) => t.diagramId === diagram.id);
    if (existing) {
      switchTab(existing.id);
      return;
    }
    const t = { id: uid("tab"), diagramId: diagram.id, name: diagram.name, nodes: diagram.nodes, edges: diagram.edges };
    setTabs((prev) => [...prev, t]);
    switchTab(t.id);
  };

  const removeFromLibrary = async (id, evt) => {
    evt.stopPropagation();
    try {
      await deleteDiagram(id);
      setSavedList((prev) => prev.filter((d) => d.id !== id));
      setTabs((prev) => prev.map((t) => (t.diagramId === id ? { ...t, diagramId: null } : t)));
    } catch (e) {}
  };

  const addNode = (type) => {
    const meta = NODE_TYPES[type];
    const n = {
      id: uid("n"),
      type,
      label: meta.label,
      x: 80 + Math.random() * 60,
      y: 80 + Math.random() * 60,
      w: meta.w,
      h: meta.h,
    };
    updateNodes((prev) => [...prev, n]);
    setSelectedId(n.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateNodes((prev) => prev.filter((n) => n.id !== selectedId));
    updateEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId && e.id !== selectedId));
    setSelectedId(null);
  };

  const onNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(node.id);
      } else if (connectFrom !== node.id) {
        updateEdges((prev) => [...prev, { id: uid("e"), source: connectFrom, target: node.id, label: "" }]);
        setConnectFrom(null);
        setConnectMode(false);
      }
      return;
    }
    setSelectedId(node.id);
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = {
      id: node.id,
      offsetX: (e.clientX - rect.left - pan.x) / scale - node.x,
      offsetY: (e.clientY - rect.top - pan.y) / scale - node.y,
    };
  };

  const onCanvasMouseDown = (e) => {
    if (e.target !== containerRef.current && !e.target.dataset.canvasBg) return;
    setSelectedId(null);
    if (connectMode) {
      setConnectMode(false);
      setConnectFrom(null);
      return;
    }
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e) => {
    if (dragRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / scale - dragRef.current.offsetX;
      const y = (e.clientY - rect.top - pan.y) / scale - dragRef.current.offsetY;
      const id = dragRef.current.id;
      updateNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
    } else if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setPan({ x: panRef.current.panX + dx, y: panRef.current.panY + dy });
    }
  };

  const onMouseUp = () => {
    dragRef.current = null;
    panRef.current = null;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(2, Math.max(0.4, +(s + delta).toFixed(2))));
  };

  const startEditLabel = (node) => {
    setEditingLabelId(node.id);
    setEditingText(node.label);
  };

  const commitEditLabel = () => {
    updateNodes((prev) => prev.map((n) => (n.id === editingLabelId ? { ...n, label: editingText } : n)));
    setEditingLabelId(null);
  };

  const startEditEdgeLabel = (edge) => {
    setEditingLabelId(edge.id);
    setEditingText(edge.label || "");
  };

  const commitEditEdgeLabel = () => {
    updateEdges((prev) => prev.map((e) => (e.id === editingLabelId ? { ...e, label: editingText } : e)));
    setEditingLabelId(null);
  };

  const generateFromAI = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError("");
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiText }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || "Lỗi máy chủ");
      }
      const clean = String(data.text || "").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const rawNodes = (parsed.nodes || []).map((n) => {
        const type = NODE_TYPES[n.type] ? n.type : "process";
        return { id: n.id || uid("n"), type, label: n.label || "Bước", w: NODE_TYPES[type].w, h: NODE_TYPES[type].h };
      });
      const rawEdges = (parsed.edges || []).map((e) => ({ id: uid("e"), source: e.source, target: e.target, label: e.label || "" }));
      const laidOut = autoLayout(rawNodes, rawEdges);
      if (nodes.length > 0) {
        const ok = window.confirm("Thao tác này sẽ thay thế nội dung tab hiện tại. Tiếp tục?");
        if (!ok) {
          setAiLoading(false);
          return;
        }
      }
      updateNodes(() => laidOut);
      updateEdges(() => rawEdges);
      setPan({ x: 0, y: 0 });
      setScale(1);
      setAiText("");
    } catch (e) {
      setAiError("Không sinh được sơ đồ. Thử mô tả rõ ràng hơn hoặc thử lại sau.");
    } finally {
      setAiLoading(false);
    }
  };

  const exportSVG = () => {
    if (nodes.length === 0) return;
    const minX = Math.min(0, ...nodes.map((n) => n.x)) - 40;
    const minY = Math.min(0, ...nodes.map((n) => n.y)) - 40;
    const maxX = Math.max(400, ...nodes.map((n) => n.x + n.w)) + 40;
    const maxY = Math.max(300, ...nodes.map((n) => n.y + n.h)) + 40;
    const w = maxX - minX;
    const h = maxY - minY;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" font-family="Arial, sans-serif">`;
    svg += `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#0E2340"/>`;
    svg += `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#CBD5E1"/></marker></defs>`;
    edges.forEach((e) => {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) return;
      const scx = s.x + s.w / 2;
      const scy = s.y + s.h / 2;
      const tcx = t.x + t.w / 2;
      const tcy = t.y + t.h / 2;
      const p1 = borderPoint(scx, scy, s.w / 2, s.h / 2, tcx, tcy);
      const p2 = borderPoint(tcx, tcy, t.w / 2, t.h / 2, scx, scy);
      svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#CBD5E1" stroke-width="1.5" marker-end="url(#arrow)"/>`;
      if (e.label) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        svg += `<rect x="${mx - e.label.length * 3.5 - 4}" y="${my - 9}" width="${e.label.length * 7 + 8}" height="16" fill="#0E2340"/>`;
        svg += `<text x="${mx}" y="${my + 4}" font-size="12" fill="#CBD5E1" text-anchor="middle">${escapeXml(e.label)}</text>`;
      }
    });
    nodes.forEach((n) => {
      const meta = NODE_TYPES[n.type];
      if (n.type === "decision") {
        const cx = n.x + n.w / 2;
        const cy = n.y + n.h / 2;
        svg += `<polygon points="${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}" fill="${meta.bg}" stroke="${meta.border}" stroke-width="1.5"/>`;
      } else if (meta.shape === "parallelogram") {
        const off = n.w * 0.14;
        svg += `<polygon points="${n.x + off},${n.y} ${n.x + n.w},${n.y} ${n.x + n.w - off},${n.y + n.h} ${n.x},${n.y + n.h}" fill="${meta.bg}" stroke="${meta.border}" stroke-width="1.5"/>`;
      } else {
        const rx = meta.shape === "pill" ? n.h / 2 : 10;
        svg += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" fill="${meta.bg}" stroke="${meta.border}" stroke-width="1.5"/>`;
      }
      svg += `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 4}" font-size="13" fill="${meta.border}" text-anchor="middle">${escapeXml(n.label)}</text>`;
    });
    svg += `</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (activeTab.name || "so-do") + ".svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready) {
    return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#334" }}>Đang tải dữ liệu...</div>;
  }

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', Arial, sans-serif",
        display: "flex",
        height: "100vh",
        background: "#0E2340",
        color: "#E4ECF7",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .dg-btn { background:#132B4D; border:1px solid #2A4A78; color:#CBD9EE; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-family:'IBM Plex Sans',sans-serif; }
        .dg-btn:hover { background:#1B3A63; }
        .dg-btn.active { background:#E8A33D; border-color:#E8A33D; color:#12233F; }
        .dg-side-item { padding:8px 10px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; justify-content:space-between; align-items:center; gap:6px; }
        .dg-side-item:hover { background:#132B4D; }
        .dg-input { background:#0E2340; border:1px solid #2A4A78; color:#E4ECF7; padding:6px 8px; border-radius:6px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; }
        .dg-scroll::-webkit-scrollbar { width:6px; }
        .dg-scroll::-webkit-scrollbar-thumb { background:#2A4A78; border-radius:3px; }
        .dg-tab { padding:7px 10px; font-size:12px; border-right:1px solid #1B3A63; display:flex; align-items:center; gap:8px; cursor:pointer; color:#8FA8CC; white-space:nowrap; }
        .dg-tab.active { background:#0E2340; color:#E4ECF7; border-bottom:2px solid #E8A33D; }
        .dg-tab:hover { background:#132B4D; }
      `}</style>

      {sidebarOpen && (
        <div className="dg-scroll" style={{ width: 210, borderRight: "1px solid #1B3A63", padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6E8CB5", letterSpacing: 1 }}>THƯ VIỆN ĐÃ LƯU</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {savedList.map((d) => (
              <div key={d.id} className="dg-side-item" onClick={() => openFromLibrary(d)}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                <span onClick={(e) => removeFromLibrary(d.id, e)} style={{ color: "#D96C6C", fontSize: 11, flexShrink: 0 }} title="Xóa">
                  ✕
                </span>
              </div>
            ))}
            {savedList.length === 0 && <div style={{ fontSize: 11, color: "#6E8CB5" }}>Chưa lưu sơ đồ nào.</div>}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid #1B3A63", overflowX: "auto" }}>
          <button className="dg-btn" style={{ margin: 6, flexShrink: 0 }} onClick={() => setSidebarOpen((s) => !s)}>☰</button>
          {tabs.map((t) => (
            <div key={t.id} className={"dg-tab" + (t.id === activeTabId ? " active" : "")} onClick={() => switchTab(t.id)}>
              <span>{t.name}</span>
              <span onClick={(e) => closeTab(t.id, e)} style={{ color: "#7089AC" }}>✕</span>
            </div>
          ))}
          <button className="dg-btn" style={{ margin: 6, flexShrink: 0 }} onClick={openNewTab}>+ Tab mới</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #1B3A63", flexWrap: "wrap" }}>
          <input className="dg-input" style={{ width: 170 }} value={activeTab ? activeTab.name : ""} onChange={(e) => setTabName(e.target.value)} />
          <button className="dg-btn active" onClick={saveToLibrary}>💾 Lưu vào thư viện</button>
          <span style={{ fontSize: 11, color: "#6E8CB5", minWidth: 60 }}>{saveStatus}</span>
          <div style={{ width: 1, height: 20, background: "#1B3A63" }} />
          {Object.entries(NODE_TYPES).map(([key, meta]) => (
            <button key={key} className="dg-btn" onClick={() => addNode(key)}>+ {meta.label}</button>
          ))}
          <div style={{ width: 1, height: 20, background: "#1B3A63" }} />
          <button className={"dg-btn" + (connectMode ? " active" : "")} onClick={() => { setConnectMode((c) => !c); setConnectFrom(null); }}>⇢ Nối</button>
          <button className="dg-btn" onClick={deleteSelected} disabled={!selectedId}>🗑 Xóa</button>
          <button className="dg-btn" onClick={exportSVG}>⬇ Xuất SVG</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <button className="dg-btn" onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))}>−</button>
            <span style={{ fontSize: 11, color: "#6E8CB5", width: 36, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
            <button className="dg-btn" onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2)))}>+</button>
          </div>
        </div>

        <div
          ref={containerRef}
          data-canvas-bg="1"
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            cursor: connectMode ? "crosshair" : "grab",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: `${28 * scale}px ${28 * scale}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0", width: 4000, height: 3000 }}>
            <svg width={4000} height={3000} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
              <defs>
                <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#7FA0C9" />
                </marker>
              </defs>
              {edges.map((e) => {
                const s = nodes.find((n) => n.id === e.source);
                const t = nodes.find((n) => n.id === e.target);
                if (!s || !t) return null;
                const scx = s.x + s.w / 2;
                const scy = s.y + s.h / 2;
                const tcx = t.x + t.w / 2;
                const tcy = t.y + t.h / 2;
                const p1 = borderPoint(scx, scy, s.w / 2, s.h / 2, tcx, tcy);
                const p2 = borderPoint(tcx, tcy, t.w / 2, t.h / 2, scx, scy);
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;
                return (
                  <g key={e.id}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#7FA0C9" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
                    {e.label && (
                      <g style={{ pointerEvents: "auto", cursor: "text" }} onDoubleClick={() => startEditEdgeLabel(e)}>
                        <rect x={mx - e.label.length * 3.6 - 4} y={my - 9} width={e.label.length * 7.2 + 8} height={16} fill="#0E2340" />
                        <text x={mx} y={my + 4} fontSize="11" fill="#B9CBE5" textAnchor="middle">{e.label}</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const meta = NODE_TYPES[n.type];
              const isSelected = selectedId === n.id;
              const isConnectSrc = connectFrom === n.id;
              return (
                <div
                  key={n.id}
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onDoubleClick={() => startEditLabel(n)}
                  style={{
                    position: "absolute",
                    left: n.x,
                    top: n.y,
                    width: n.w,
                    height: n.h,
                    background: meta.bg,
                    border: `2px solid ${isSelected || isConnectSrc ? "#E8A33D" : meta.border}`,
                    clipPath: shapeClipPath(meta.shape),
                    borderRadius: meta.shape === "pill" ? n.h / 2 : meta.shape === "rect" ? 10 : 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px 14px",
                    cursor: connectMode ? "pointer" : "grab",
                    userSelect: "none",
                    boxShadow: isSelected ? "0 0 0 3px rgba(232,163,61,0.25)" : "none",
                  }}
                >
                  {editingLabelId === n.id ? (
                    <input
                      autoFocus
                      className="dg-input"
                      style={{ width: "90%", textAlign: "center" }}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={commitEditLabel}
                      onKeyDown={(e) => e.key === "Enter" && commitEditLabel()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span style={{ fontSize: 13, color: meta.border, textAlign: "center", fontWeight: 500 }}>{n.label}</span>
                  )}
                </div>
              );
            })}
          </div>

          {editingLabelId && edges.find((e) => e.id === editingLabelId) && (
            <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#132B4D", border: "1px solid #2A4A78", borderRadius: 8, padding: 10, display: "flex", gap: 8, zIndex: 10 }}>
              <input
                autoFocus
                className="dg-input"
                placeholder="Nhãn cạnh nối (vd: Có / Không)"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitEditEdgeLabel()}
              />
              <button className="dg-btn" onClick={commitEditEdgeLabel}>OK</button>
            </div>
          )}

          {connectMode && (
            <div style={{ position: "absolute", top: 10, left: 10, background: "#132B4D", border: "1px solid #E8A33D", color: "#E8A33D", fontSize: 11, padding: "6px 10px", borderRadius: 6 }}>
              {connectFrom ? "Chọn khối đích để nối" : "Chọn khối nguồn"}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #1B3A63", padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <textarea
            className="dg-input"
            style={{ flex: 1, resize: "none", height: 44, fontFamily: "'IBM Plex Sans',sans-serif" }}
            placeholder="Mô tả quy trình bằng lời, vd: Khách đặt hàng, kiểm tra tồn kho, nếu còn hàng thì giao hàng, nếu hết hàng thì báo khách..."
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
          />
          <button className="dg-btn active" style={{ height: 44, whiteSpace: "nowrap" }} onClick={generateFromAI} disabled={aiLoading}>
            {aiLoading ? "Đang sinh..." : "✨ Sinh bằng AI"}
          </button>
        </div>
        {aiError && <div style={{ fontSize: 11, color: "#D96C6C", padding: "0 12px 10px" }}>{aiError}</div>}
      </div>
    </div>
  );
}
