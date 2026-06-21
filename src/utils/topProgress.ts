const topProgressStartEvent = "splitverse:top-progress-start";
const topProgressEndEvent = "splitverse:top-progress-end";
let topProgressSequence = 0;

function makeTopProgressId() {
  topProgressSequence += 1;
  return `top-progress-${Date.now()}-${topProgressSequence}`;
}

export function startTopProgress(id = makeTopProgressId()) {
  window.dispatchEvent(
    new CustomEvent(topProgressStartEvent, { detail: { id } }),
  );

  return id;
}

export function endTopProgress(id: string) {
  window.dispatchEvent(
    new CustomEvent(topProgressEndEvent, { detail: { id } }),
  );
}

export async function withTopProgress<T>(callback: () => Promise<T>) {
  const progressId = startTopProgress();

  try {
    return await callback();
  } finally {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    endTopProgress(progressId);
  }
}

export const topProgressEvents = {
  end: topProgressEndEvent,
  start: topProgressStartEvent,
};
