import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

// 全局渲染兜底：任何子树渲染/生命周期抛出异常时，展示友好错误页而非整页白屏。
// 各板块的数据请求失败仍由各组件自行 try/catch 降级，本边界只兜 React 渲染期崩溃。
interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

const BOX_STYLE: CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg,#f5f3ff 0%,#eef2ff 100%)', padding: 24,
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
};
const CARD_STYLE: CSSProperties = {
  maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16, padding: '32px 28px',
  boxShadow: '0 20px 50px rgba(76,29,149,.12)', textAlign: 'center',
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error ?? '未知错误') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    try { console.error('[xc] render error:', error, info); } catch { /* noop */ }
  }

  private reload = () => { try { window.location.reload(); } catch { /* noop */ } };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={BOX_STYLE}>
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🫣</div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            页面遇到一点问题
          </h1>
          <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.7, marginBottom: 20 }}>
            工作台渲染时出现异常，已填写的内容不会受影响。请刷新页面重试；
            若多次出现，请联系渠道管理员并反馈下方错误信息。
          </p>
          <button
            onClick={this.reload}
            style={{
              padding: '9px 28px', border: 0, borderRadius: 10, cursor: 'pointer',
              background: '#7c3aed', color: '#fff', fontSize: 13.5, fontWeight: 600,
            }}
          >
            刷新页面重试
          </button>
          {this.state.message && (
            <p style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {this.state.message.slice(0, 200)}
            </p>
          )}
        </div>
      </div>
    );
  }
}
