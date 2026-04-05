import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {SERVER_URL, disconnect} from '../net/socket';
import {soundManager} from '../sound/SoundManager';

/**
 * Стартовый экран выбора роли.
 * При попадании на эту страницу сокет принудительно отключается.
 * Это решает баг когда пользователь открыл /director, потом нажал
 * "В меню", но соединение с прошлой ролью осталось висеть и сервер
 * считал роль занятой.
 *
 * В главном меню играет только трек INTRO зацикленно. При выходе из
 * любой роли сюда музыка переключается на этот трек, всё остальное
 * останавливается.
 *
 * Также проверяется доступность сервера через REST /api/health.
 */
export function RoleSelection() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [muted, setMuted] = useState(soundManager.isMuted());

  useEffect(() => {
    // Освобождаем роль если она была занята в этой вкладке
    disconnect();

    // Останавливаем всё что играло раньше (BGM игры и пр.) и запускаем INTRO в loop
    soundManager.stopAll();
    soundManager.playLoop('INTRO');

    const controller = new AbortController();
    fetch(`${SERVER_URL}/api/health`, {signal: controller.signal})
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(() => setHealth('ok'))
      .catch(() => setHealth('fail'));

    return () => {
      controller.abort();
      // Когда пользователь покинул главное меню (выбрал роль), останавливаем INTRO loop
      soundManager.stop('INTRO');
    };
  }, []);

  const toggleSound = () => {
    setMuted(soundManager.toggleMute());
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background:
          'url(/images/bg.jpg) center/cover no-repeat, ' +
          'radial-gradient(ellipse at center, #1a2a6c 0%, #0a0f2e 60%, #000008 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'Georgia, serif',
        position: 'relative',
      }}
    >
      {/* Кнопка звука в углу */}
      <button
        onClick={toggleSound}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          padding: '8px 14px',
          background: 'rgba(0,0,0,0.6)',
          color: '#cbd5e1',
          border: '1px solid #334155',
          borderRadius: 6,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {muted ? 'звук выкл' : 'звук вкл'}
      </button>

      {/* Затемняющий слой для читаемости */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,10,0.55)',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <img
          src="/images/logo.png"
          alt="Кто хочет стать миллионером"
          style={{
            width: 'clamp(180px, 25vw, 320px)',
            height: 'auto',
            marginBottom: 20,
            filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.9))',
          }}
        />

        <h1
          style={{
            fontSize: 'clamp(1.5rem, 4vw, 2.8rem)',
            textAlign: 'center',
            color: '#f5c542',
            textShadow: '0 4px 10px rgba(0,0,0,0.9)',
            margin: '0 0 40px',
            letterSpacing: 2,
          }}
        >
          Кто хочет стать миллионером?
        </h1>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            width: 320,
            maxWidth: '90%',
          }}
        >
          <RoleButton
            emoji="🎬"
            title="Режиссёр"
            subtitle="управление игрой"
            onClick={() => navigate('/director')}
          />
          <RoleButton
            emoji="🎤"
            title="Ведущий"
            subtitle="фиксация ответов"
            onClick={() => navigate('/host')}
          />
          <RoleButton
            emoji="📺"
            title="Игрок"
            subtitle="только экран игры"
            onClick={() => navigate('/player')}
          />
        </div>

        <div
          style={{
            marginTop: 40,
            padding: '10px 20px',
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 8,
            fontSize: 13,
            color: '#cbd5e1',
            fontFamily: 'ui-monospace, Menlo, monospace',
            textAlign: 'center',
          }}
        >
          <div>
            Сервер: <span style={{color: '#f5c542'}}>{SERVER_URL}</span>
          </div>
          <div style={{marginTop: 4}}>
            Статус: {health === 'loading' && 'проверка...'}
            {health === 'ok' && <span style={{color: '#86efac'}}>онлайн</span>}
            {health === 'fail' && <span style={{color: '#fca5a5'}}>не отвечает</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleButton({
  emoji, title, subtitle, onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '18px 22px',
        background: 'linear-gradient(180deg, #16244d 0%, #0a102b 100%)',
        color: '#fff',
        border: '2px solid #3366cc',
        borderRadius: 12,
        cursor: 'pointer',
        fontFamily: 'Georgia, serif',
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        transition: 'all 0.2s',
        textAlign: 'left',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = '#f5c542';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = '#3366cc';
      }}
    >
      <span style={{fontSize: 32}}>{emoji}</span>
      <div>
        <div style={{fontWeight: 'bold'}}>{title}</div>
        <div style={{fontSize: 12, color: '#cbd5e1'}}>{subtitle}</div>
      </div>
    </button>
  );
}
