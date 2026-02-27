import React from 'react';
import classes from './TopAlarm.module.scss';
import { useUIStore } from '@/store/uiStore';

const TopAlarm = () => {
  const topAlarm = useUIStore((s) => s.topAlarm);
  if (!topAlarm) return null;

  return (
    <div className={`${classes.top_alarm} ${topAlarm.open ? classes.top_alarm_open : ''}`.trim()}>
      {topAlarm.message}
    </div>
  );
};

export default TopAlarm;

