/**
 * EOPP Browser Extension - Main App Component
 *
 * Главный компонент расширения. Рендерит модальное окно (Modal).
 * Modal содержит форму конфигурации (ConfigForm) и pipeline запуска.
 *
 * Используется: content script инжектирует в страницу EOPP
 */
import Modal from "@/components/Modal";

interface Props {
  onClose: () => void;
}

export function App({ onClose }: Props) {
  return <Modal onClose={onClose} />;
}
