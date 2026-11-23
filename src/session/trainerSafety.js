// A ride that used a trainer must never silently become a keyboard ride.
export function noteTrainerConnection(state) {
  if (!state.hasRideStarted || state.isRideFinished) return false;
  if (state.bleConnected) {
    state.trainerWasRequired = true;
    return false;
  }
  if (!state.trainerWasRequired || state.requiresTrainerReconnect) return false;
  state.requiresTrainerReconnect = true;
  return true;
}

export function canResumeTrainerRide(state) {
  return !state.requiresTrainerReconnect || Boolean(state.bleConnected);
}

export function resetTrainerSafety(state) {
  state.requiresTrainerReconnect = false;
  state.trainerWasRequired = false;
}
