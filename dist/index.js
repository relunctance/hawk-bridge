// hawk-bridge plugin entry point
// Bridges OpenClaw Gateway hooks to hawk Python memory system
import recallHandler from './hooks/recall.js';
import captureHandler from './hooks/capture.js';
export { recallHandler as 'hawk-recall', captureHandler as 'hawk-capture' };
export default {
    id: 'hawk-bridge',
    name: 'hawk-bridge',
    version: '1.0.0',
    description: 'AutoCapture + AutoRecall bridge to hawk Python memory system',
    hooks: {
        'hawk-recall': recallHandler,
        'hawk-capture': captureHandler,
    },
};
