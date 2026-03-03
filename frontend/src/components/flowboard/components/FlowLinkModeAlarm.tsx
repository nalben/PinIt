import React from 'react';
import classes from '@/components/flow/FlowBoard.module.scss';

export const FlowLinkModeAlarm: React.FC<{
  step: 'off' | 'first' | 'second';
  onCancel: () => void;
}> = ({ step, onCancel }) => {
  if (step === 'off') return null;

  return (
    <div className={classes.link_mode_alarm} aria-live="polite">
      <div className={classes.link_mode_alarm_inner}>
        <div className={classes.link_mode_alarm_text}>
          {step === 'first' ? 'Выберите первую запись для связки' : 'Выберите вторую запись для связки'}
        </div>
        <button type="button" className={classes.link_mode_alarm_cancel} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
};
