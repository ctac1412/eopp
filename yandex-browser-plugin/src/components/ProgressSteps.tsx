import React from 'react';
import { useInjectorStore } from '@/store';
import type { PipelineStage } from '@/types';

const STAGES: PipelineStage[] = ['slots', 'captcha', 'solving', 'validating', 'submitting'];
const STAGE_LABELS: Record<PipelineStage, string> = {
  slots: 'Слоты',
  captcha: 'Капча',
  solving: 'Решение',
  validating: 'Валидация',
  submitting: 'Отправка',
};

const QUEUE_STATUS_LABELS: Record<string, string> = {
  pending: '⏳',
  solving: '🔄',
  validating: '🔍',
  submitting: '📤',
  done: '✓',
  failed: '✗',
};

const ProgressSteps = React.memo(function ProgressSteps() {
  const currentStage = useInjectorStore((s) => s.currentStage);
  const status = useInjectorStore((s) => s.status);
  const queueItems = useInjectorStore((s) => s.queueItems);
  const queueIndex = useInjectorStore((s) => s.queueIndex);

  if (status !== 'running' && status !== 'done' && status !== 'error') return null;

  const showQueue = queueItems !== null && queueItems.length > 0;

  return (
    <div className="injector-progress">
      {showQueue ? (
        <>
          {queueItems.map((item, idx) => {
            const isCurrent = idx === queueIndex;
            const isDone = item.status === 'done';
            const isFailed = item.status === 'failed';

            return (
              <div
                key={item.slotId}
                className={`injector-progress-step ${isDone ? 'injector-progress-done' : ''} ${isCurrent ? 'injector-progress-current' : ''} ${isFailed ? 'injector-progress-failed' : ''}`}
              >
                <span className="injector-progress-dot">
                  {QUEUE_STATUS_LABELS[item.status] ?? idx + 1}
                </span>
                <span className="injector-progress-label">
                  Капча {idx + 1}/{queueItems.length} {item.slotTime}
                  {item.error && ` (${item.error.slice(0, 20)})`}
                </span>
              </div>
            );
          })}
        </>
      ) : (
        STAGES.map((stage) => {
          const idx = STAGES.indexOf(stage);
          const currentIdx = currentStage ? STAGES.indexOf(currentStage) : -1;
          const isDone = status === 'done' || idx < currentIdx;
          const isCurrent = currentStage === stage;
          const isFailed = status === 'error' && isCurrent;

          return (
            <div
              key={stage}
              className={`injector-progress-step ${isDone ? 'injector-progress-done' : ''} ${isCurrent ? 'injector-progress-current' : ''} ${isFailed ? 'injector-progress-failed' : ''}`}
            >
              <span className="injector-progress-dot">
                {isDone ? '✓' : isFailed ? '✗' : idx + 1}
              </span>
              <span className="injector-progress-label">{STAGE_LABELS[stage]}</span>
            </div>
          );
        })
      )}
    </div>
  );
});

export default ProgressSteps;
