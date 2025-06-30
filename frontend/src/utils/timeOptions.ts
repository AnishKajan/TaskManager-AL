// Time options for dropdowns
export const AMPMOptions = ['AM', 'PM'];

export const hourOptions = Array.from({ length: 12 }, (_, i) => `${i + 1}`);

export const minuteOptions = Array.from({ length: 60 }, (_, i) =>
  i.toString().padStart(2, '0')
);

export const priorityOptions = ['Low', 'Medium', 'High'];

// Recurring options - Added "Weekdays" and removed "None"
export const recurringOptions = ['Daily', 'Weekdays', 'Weekly', 'Monthly', 'Yearly'];