export function clearManagedTimeout(timeoutRef, logMessage = null) {
  if (!timeoutRef.current) return;

  if (logMessage) {
    console.log(logMessage);
  }

  clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}

export function clearManagedInterval(intervalRef) {
  if (!intervalRef.current) return;

  clearInterval(intervalRef.current);
  intervalRef.current = null;
}

export function clearManagedTimeoutMap(timeoutMapRef) {
  Object.values(timeoutMapRef.current).forEach(clearTimeout);
  timeoutMapRef.current = {};
}

export function restartManagedInterval(intervalRef, callback, delayMs) {
  clearManagedInterval(intervalRef);
  intervalRef.current = setInterval(callback, delayMs);
  return intervalRef.current;
}

export function scheduleManagedTimeout(timeoutRef, callback, delayMs) {
  clearManagedTimeout(timeoutRef);
  timeoutRef.current = setTimeout(callback, delayMs);
  return timeoutRef.current;
}
