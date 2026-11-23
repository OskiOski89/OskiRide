export const SESSION_LABELS = Object.freeze({ready:'Ride setup',riding:'Riding',paused:'Pause',finished:'Finished'});

export function setSessionStatus(state, status) {
  if (!(status in SESSION_LABELS)) throw new Error('Unknown session status.');
  state.sessionStatus = status;
  // Pola zgodności dla istniejących modułów i testów.
  state.hasRideStarted = status !== 'ready';
  state.isRidePaused = status === 'paused';
  state.isRideFinished = status === 'finished';
}

export function isRideRunning(state) {
  return state.hasRideStarted && !state.isRideFinished && !state.isRidePaused;
}
