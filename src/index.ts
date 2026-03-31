// hawk-bridge plugin entry point
// Bridges OpenClaw Gateway hooks to hawk Python memory system

import recallHandler from './hooks/hawk-recall/handler.js';
import captureHandler from './hooks/hawk-capture/handler.js';

export { recallHandler as 'hawk-recall', captureHandler as 'hawk-capture' };

function register(api: any) {
  api.registerHook(['agent:bootstrap'], recallHandler, {
    name: 'hawk-recall',
    description: 'Inject relevant hawk memories before agent starts',
  });
  api.registerHook(['message:sent'], captureHandler, {
    name: 'hawk-capture',
    description: 'Auto-extract and store memories after agent responds',
  });
}

export default { register };
