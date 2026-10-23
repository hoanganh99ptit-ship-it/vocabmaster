import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in VocabMaster:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('vocabmaster_theme');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0c0a08] text-amber-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#18130e] border border-amber-500/40 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-amber-200 mb-2">
              Đã xảy ra sự cố hiển thị
            </h2>
            <p className="text-sm text-stone-400 mb-6">
              Ứng dụng gặp lỗi tạm thời khi tải nội dung. Hãy thử làm mới lại trang để tiếp tục học tập bình thường.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left text-rose-300/80 bg-black/40 p-3 rounded-lg overflow-x-auto mb-6 max-h-32 border border-rose-500/20 font-mono">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-bold hover:from-amber-400 hover:to-yellow-400 transition-all cursor-pointer shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2.5 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-sm font-semibold transition-colors cursor-pointer"
              >
                Đặt lại cài đặt
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
