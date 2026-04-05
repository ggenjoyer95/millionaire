import { Routes, Route, Navigate } from 'react-router-dom';
import { RoleSelection } from './pages/RoleSelection';
import { DirectorPage } from './pages/DirectorPage';
import { HostPage } from './pages/HostPage';
import { PlayerPage } from './pages/PlayerPage';
import { ConnectionStatus } from './components/ConnectionStatus';

/**
 * Корневой компонент приложения.
 * Три маршрута — по роли. Глобальный индикатор соединения отрисовывается
 * поверх всего (fixed).
 */
export default function App() {
    return (
        <>
            <Routes>
                <Route path="/" element={<RoleSelection />} />
                <Route path="/director" element={<DirectorPage />} />
                <Route path="/host" element={<HostPage />} />
                <Route path="/player" element={<PlayerPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ConnectionStatus />
        </>
    );
}
