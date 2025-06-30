export type UserType = {
  id: string;
  name: string;
  email: string;
};

export type Time = {
  hour: string;
  minute: string;
  ampm: string;
};

export type Task = {
  id: string;
  title: string;
  startTime: Time;
  endTime?: Time;
  collaborators?: UserType[];
  priority?: string;
  recurring?: string;
  section: string;
  status: string;
  date: string;
};
