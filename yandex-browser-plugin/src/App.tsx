import Modal from '@/components/Modal';

interface Props {
  onClose: () => void;
}

export function App({ onClose }: Props) {
  return <Modal onClose={onClose} />;
}
