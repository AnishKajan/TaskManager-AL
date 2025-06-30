declare module 'react-beautiful-dnd' {
  import * as React from 'react';

  export interface DraggableProvided {
    draggableProps: React.HTMLAttributes<HTMLElement>;
    dragHandleProps: React.HTMLAttributes<HTMLElement> | null;
    innerRef: (element?: HTMLElement | null) => any;
  }

  export interface DroppableProvided {
    droppableProps: React.HTMLAttributes<HTMLElement>;
    innerRef: (element?: HTMLElement | null) => any;
    placeholder: React.ReactElement<any> | null;
  }

  export interface DragStart {
    draggableId: string;
    type: string;
    source: {
      droppableId: string;
      index: number;
    };
  }

  export interface DragEnd {
    draggableId: string;
    type: string;
    source: {
      droppableId: string;
      index: number;
    };
    destination?: {
      droppableId: string;
      index: number;
    } | null;
  }

  export interface DroppableProps {
    droppableId: string;
    children: (provided: DroppableProvided) => React.ReactNode;
    type?: string;
    direction?: 'vertical' | 'horizontal';
    isDropDisabled?: boolean;
  }

  export interface DraggableProps {
    draggableId: string;
    index: number;
    children: (provided: DraggableProvided) => React.ReactNode;
    isDragDisabled?: boolean;
  }

  export interface DragDropContextProps {
    onDragEnd: (result: DragEnd) => void;
    onDragStart?: (start: DragStart) => void;
    children: React.ReactNode;
  }

  export const DragDropContext: React.FC<DragDropContextProps>;
  export const Droppable: React.FC<DroppableProps>;
  export const Draggable: React.FC<DraggableProps>;
}