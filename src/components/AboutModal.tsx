import type { RefObject } from 'react';
import appIcon from '../assets/startup/icon.png';
import { Icon } from './Icon';

interface OpenSourceItem {
  name: string;
  version: string;
  license: string;
  role: string;
}

const OPEN_SOURCE_GROUPS: ReadonlyArray<{ title: string; items: ReadonlyArray<OpenSourceItem> }> = [
  {
    title: '核心',
    items: [
      { name: '@excalidraw/excalidraw', version: '0.18.1', license: 'MIT', role: '白板画布核心' },
      { name: '@excalidraw/mermaid-to-excalidraw', version: '3.6.0', license: 'MIT', role: '图表转白板' },
      { name: 'mermaid', version: '11.17.2', license: 'MIT', role: 'Mermaid 解析' },
    ],
  },
  {
    title: '基础框架',
    items: [
      { name: 'react / react-dom', version: '19.3.1', license: 'MIT', role: '界面框架' },
      { name: '@modelcontextprotocol/sdk', version: '1.32.2', license: 'MIT', role: 'MCP 基础服务框架' },
      { name: 'zod', version: '4.6.7', license: 'MIT', role: '数据结构与参数校验框架' },
    ],
  },
  {
    title: '支持与工具链',
    items: [
      { name: 'heic-convert', version: '2.1.0', license: 'ISC', role: 'HEIC 图像支持' },
      { name: 'pngjs', version: '6.0.0', license: 'MIT', role: 'PNG 图像优化' },
      { name: 'vite / @vitejs/plugin-react', version: '8.3.8', license: 'MIT', role: '界面构建与开发服务器' },
      { name: 'rolldown', version: '1.3.2', license: 'MIT', role: '模块打包器' },
      { name: 'typescript', version: '7.0.2', license: 'Apache-2.0', role: '静态类型检查与编译' },
      { name: 'oxlint', version: '1.93.0', license: 'MIT', role: '代码检查' },
    ],
  },
];

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
}

export function AboutModal({ open, onClose, panelRef }: AboutModalProps) {
  return (
    <div
      className={`menu-overlay ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      inert={!open}
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="menu-panel glass about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="关于 Excalidraw+"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="menu-panel-header">
          <div className="mcp-card-info">
            <Icon name="info" />
            <span className="mcp-card-name">关于</span>
          </div>
          <button
            type="button"
            className="menu-close"
            title="关闭"
            aria-label="关闭关于"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="menu-panel-body about-body">
          <div className="about-hero">
            <img className="about-app-icon" src={appIcon} alt="Excalidraw+ 图标" />
            <h2 className="about-app-name">Excalidraw+</h2>
            <p className="about-app-desc">由 AI 驱动的白板工具。</p>
          </div>

          <div className="about-meta">
            <div className="about-meta-row">
              <span className="about-meta-label">作者</span>
              <span className="about-meta-value">@Andy17269</span>
            </div>
            <div className="about-meta-row">
              <span className="about-meta-label">GitHub 仓库</span>
              <a
                className="about-meta-link"
                href="https://github.com/Andy17269/excalidraw-depame"
                target="_blank"
                rel="noreferrer"
              >
                Andy17269/excalidraw-depame
              </a>
            </div>
          </div>

          <div className="about-licenses">
            <div className="about-licenses-title">开放源代码</div>
            {OPEN_SOURCE_GROUPS.map(group => (
              <div key={group.title} className="about-license-group">
                <div className="about-license-group-title">{group.title}</div>
                <div className="about-license-list">
                  {group.items.map(item => (
                    <div key={item.name} className="about-license-item">
                      <div className="about-license-main">
                        <span className="about-license-name">{item.name}</span>
                        <span className="about-license-role">{item.role}</span>
                      </div>
                      <div className="about-license-tags">
                        <span className="about-license-version">v{item.version}</span>
                        <span className="about-license-badge">{item.license}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
