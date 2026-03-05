/**
 * Editor Page — main editor + simulator with resizable panels
 */

import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CodeEditor } from '../components/editor/CodeEditor';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import { SimulatorCanvas } from '../components/simulator/SimulatorCanvas';
import { SerialMonitor } from '../components/simulator/SerialMonitor';
import { useSimulatorStore } from '../store/useSimulatorStore';
import '../App.css';

export const EditorPage: React.FC = () => {
  const [editorWidthPct, setEditorWidthPct] = useState(45);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const serialMonitorOpen = useSimulatorStore((s) => s.serialMonitorOpen);
  const toggleSerialMonitor = useSimulatorStore((s) => s.toggleSerialMonitor);
  const [serialHeightPct, setSerialHeightPct] = useState(30);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setEditorWidthPct(Math.max(20, Math.min(80, pct)));
    };

    const handleMouseUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007acc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="5" width="14" height="14" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
            </svg>
            <span className="header-title">Arduino Emulator</span>
          </div>
          <Link to="/examples" className="examples-link" title="Browse Examples">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Examples
          </Link>
          <button
            onClick={toggleSerialMonitor}
            className="serial-monitor-toggle"
            title="Toggle Serial Monitor"
            style={{
              background: serialMonitorOpen ? '#0e639c' : 'transparent',
              border: '1px solid #555',
              color: '#ccc',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 13,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            Serial
          </button>
        </div>
      </header>

      <div className="app-container" ref={containerRef}>
        <div className="editor-panel" style={{ width: `${editorWidthPct}%` }}>
          <EditorToolbar />
          <div className="editor-wrapper">
            <CodeEditor />
          </div>
        </div>

        {/* Resize handle */}
        <div className="resize-handle" onMouseDown={handleResizeMouseDown}>
          <div className="resize-handle-grip" />
        </div>

        <div className="simulator-panel" style={{ width: `${100 - editorWidthPct}%`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: serialMonitorOpen ? `0 0 ${100 - serialHeightPct}%` : '1 1 auto', overflow: 'hidden', position: 'relative' }}>
            <SimulatorCanvas />
          </div>
          {serialMonitorOpen && (
            <div style={{ flex: `0 0 ${serialHeightPct}%`, minHeight: 100, display: 'flex', flexDirection: 'column' }}>
              <SerialMonitor />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
