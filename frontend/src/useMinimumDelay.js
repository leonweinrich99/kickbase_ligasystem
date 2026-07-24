import { useEffect, useState } from 'react';

// Sorgt dafür, dass ein Ladezustand (z.B. der animierte Splash-Screen)
// mindestens `ms` Millisekunden sichtbar bleibt, auch wenn die eigentlichen
// Daten schneller da sind - verhindert ein störendes Aufblitzen.
const useMinimumDelay = (ms = 1500) => {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);

  return elapsed;
};

export default useMinimumDelay;
