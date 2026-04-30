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

const ProgressSteps = React.memo(function ProgressSteps() {
  const currentStage = useInjectorStore((s) => s.currentStage);
  const status = useInjectorStore((s) => s.status);

  if (status !== 'running' && status !== 'done' && status !== 'error') return null;

  return (
    <div className="injector-progress">
      {STAGES.map((stage) => {
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
      })}
    </div>
  );
});

export default ProgressSteps;
