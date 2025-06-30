import { Task } from '../types/task';

export const getMinutes = (h: string, m: string, p: string): number => {
  const hour = parseInt(h, 10) % 12 + (p === 'PM' ? 12 : 0);
  const minute = parseInt(m, 10);
  return hour * 60 + minute;
};

export const getTaskStatus = (task: Task, currentDate: Date): 'Pending' | 'In Progress' | 'Complete' => {
  const now = new Date();
  const taskDate = new Date(task.date);

  const isToday =
    now.getFullYear() === currentDate.getFullYear() &&
    now.getMonth() === currentDate.getMonth() &&
    now.getDate() === currentDate.getDate();

  const isSameDay =
    taskDate.getFullYear() === currentDate.getFullYear() &&
    taskDate.getMonth() === currentDate.getMonth() &&
    taskDate.getDate() === currentDate.getDate();

  if (!isSameDay) return 'Pending';
  if (!isToday) return 'Pending';

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const start = getMinutes(task.startTime.hour, task.startTime.minute, task.startTime.period);
  const end = task.endTime
    ? getMinutes(task.endTime.hour, task.endTime.minute, task.endTime.period)
    : null;

  if (currentMinutes < start) return 'Pending';
  if (end && currentMinutes >= start && currentMinutes <= end) return 'In Progress';
  if (currentMinutes > (end ?? start)) return 'Complete';
  return 'Pending';
};

export const isRecurringMatch = (
  recurringType: string,
  taskDateStr: string,
  currentDate: Date
): boolean => {
  if (!recurringType || !taskDateStr) return false;

  const taskDate = new Date(taskDateStr);
  const now = new Date(currentDate);

  switch (recurringType) {
    case 'Daily':
      return taskDate <= now;
    case 'Weekly':
      return taskDate <= now && taskDate.getDay() === now.getDay();
    case 'Monthly':
      return taskDate <= now && taskDate.getDate() === now.getDate();
    case 'Yearly':
      return (
        taskDate <= now &&
        taskDate.getDate() === now.getDate() &&
        taskDate.getMonth() === now.getMonth()
      );
    default:
      return false;
  }
};
