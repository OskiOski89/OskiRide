import { getWorkoutStateAtTime } from './workoutEngine.js';

// Jedna ścieżka wyboru efektywnego trybu, niezależna od renderowania HUD.
export function syncTrainerControl(state, controller, onWorkoutCompleted, now = performance.now()) {
  if (state.isRidePaused || state.isRideFinished) return;
  const workoutState = state.isWorkoutRunning && state.activeWorkout
    ? getWorkoutStateAtTime(state.activeWorkout, state.workoutElapsedSec, state.ftpWatts) : null;
  if (workoutState?.isCompleted) {
    onWorkoutCompleted();
    return;
  }
  const mode = workoutState
    ? (state.workoutErgMode && workoutState.isErgMode ? 'erg' : 'sim')
    : state.trainerMode;
  const changed = controller.setTrainerMode(mode);
  if (!state.hasRideStarted || state.isRideFinished || !state.bleConnected) return;
  if (mode === 'sim') {
    controller.updateSimulationGrade(state.currentGradePct, changed);
    return;
  }
  const target = workoutState ? workoutState.targetWatts : state.manualErgTargetWatts;
  if (changed || target !== state.lastErgTargetSent || now - state.lastErgSendTime > 1500) {
    state.lastErgTargetSent = target;
    state.lastErgSendTime = now;
    controller.setTargetPowerWatts(target);
  }
}
