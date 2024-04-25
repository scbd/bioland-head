import mitt from 'mitt';

// Create a new event bus using mitt
const eventBus = mitt();

export const useEventBus = () => eventBus;