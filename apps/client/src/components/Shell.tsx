import { ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Заголовок страницы (маленький, в углу). */
    title?: string;
    onBack?: () => void;
}

/**
 * Фоновая обёртка всех страниц.
 * Глубокий синий градиент в стиле шоу + опциональный header с кнопкой назад.
 */
export function Shell({ children, title, onBack }: Props) {
    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            background: 'radial-gradient(ellipse at center, #1a2a6c 0%, #0a0f2e 60%, #000008 100%)',
            color: '#fff',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'Georgia, serif',
        }}>
            {(title || onBack) && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px',
                    background: 'rgba(0,0,0,0.25)',
                    borderBottom: '1px solid rgba(51,102,204,0.3)',
                    zIndex: 10,
                }}>
                    {onBack ? (
                        <button onClick={onBack} style={{
                            padding: '6px 14px', background: '#1e293b',
                            color: '#e2e8f0', border: '1px solid #334155',
                            borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        }}>
                            ← В меню
                        </button>
                    ) : <span />}
                    <div style={{ color: '#f5c542', fontSize: 14, letterSpacing: 1 }}>
                        {title}
                    </div>
                    <span />
                </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                {children}
            </div>
        </div>
    );
}
