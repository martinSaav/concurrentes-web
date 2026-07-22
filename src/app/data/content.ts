export interface Topic {
  title: string;
  html: string;
  widget?:
    | 'race-detail'
    | 'mutex-detail'
    | 'sem-detail'
    | 'condvar-detail'
    | 'deadlock-detail'
    | 'rwlock-detail'
    | 'forkjoin-detail'
    | 'amdahl-detail'
    | 'mpsc-detail'
    | 'actors-detail'
    | 'async-detail'
    | 'poll-detail'
    | 'leader-detail'
    | 'twophase-detail'
    | 'distmutex-detail'
    | 'petri-detail'
    | 'reach-detail'; // componentes a medida
}

export interface Section {
  slug: string;
  title: string;
  short: string;
  icon: string;
  color: string;
  tagline: string;
  tag: string;
  topics: Topic[];
}

export const SECTIONS: Section[] = [
  /* ================================================================ */
  {
    slug: 'intro',
    title: 'Concurrencia y Rust',
    short: 'Intro',
    icon: '🦀',
    color: '#f0883e',
    tag: 'Semana 1',
    tagline: 'Qué es concurrencia, por qué Rust, hilos y ownership.',
    topics: [
      {
        title: 'Concurrencia vs paralelismo',
        html: `
<p><strong>Concurrencia</strong>: estructurar un programa como varias actividades que <strong>progresan en períodos de tiempo superpuestos</strong> y compiten/cooperan por recursos. Es un concepto de <em>diseño</em>. <strong>Paralelismo</strong>: ejecutar literalmente <strong>al mismo tiempo</strong> en hardware distinto (varios cores). Es un concepto de <em>ejecución</em>.</p>
<ul>
<li>Puede haber concurrencia <strong>sin</strong> paralelismo: un solo core intercalando hilos (time-slicing).</li>
<li>Puede haber paralelismo casi sin concurrencia "visible": paralelismo de datos puro (SIMD/GPU).</li>
</ul>
<p>¿Por qué molestarse? <strong>Performance</strong> (aprovechar N cores — la frecuencia dejó de crecer, los cores se multiplicaron), <strong>latencia/responsividad</strong> (no bloquear la UI o el servidor mientras se espera I/O) y <strong>estructura</strong> (modelar problemas que son inherentemente concurrentes).</p>
<span class="tip">La pregunta de manual: "¿concurrencia es lo mismo que paralelismo?" No. Concurrencia = lidiar con muchas cosas a la vez (estructura); paralelismo = hacer muchas cosas a la vez (ejecución).</span>`,
      },
      {
        title: 'El costo: no determinismo',
        html: `
<p>El precio de la concurrencia con estado compartido: el <strong>scheduler</strong> decide cuándo corre cada hilo, y esa decisión <strong>cambia entre corridas</strong>. El resultado puede depender del <strong>entrelazado</strong> (interleaving) de las operaciones → <strong>no determinismo</strong>.</p>
<p>De acá salen los bugs más difíciles de la práctica: <strong>race conditions</strong> que aparecen una vez cada mil corridas, <strong>deadlocks</strong> que solo se dan bajo carga, y los infames <em>heisenbugs</em> (agregás un <code>println!</code> para debuggear y el bug desaparece porque cambiaste el timing).</p>
<span class="warn">"Lo corrí 100 veces y anduvo" NO es evidencia de corrección en concurrencia. Un programa concurrente es correcto si es correcto para TODOS los entrelazados posibles.</span>`,
      },
      {
        title: 'Hilos en Rust: spawn y join',
        html: `
<p>La unidad básica: <code>std::thread</code>. Cada hilo tiene su stack propio; comparten el heap del proceso.</p>
<span class="rust">let handle = thread::spawn(move || {
    // corre en paralelo
    trabajo_pesado()
});
let resultado = handle.join().unwrap(); // espera y recupera el valor</span>
<ul>
<li><code>spawn</code> recibe una <strong>closure <code>move</code></strong>: se lleva la propiedad de lo que captura (el hilo puede vivir más que la función que lo creó).</li>
<li><code>join()</code> <strong>bloquea</strong> hasta que el hilo termine y devuelve <code>Result</code>: es <code>Err</code> si el hilo hizo panic — el panic <em>no</em> se propaga solo.</li>
<li>Si el <code>JoinHandle</code> se descarta sin join, el hilo queda <em>detached</em>; cuando <code>main</code> termina, el proceso muere y se lleva puestos a todos los hilos.</li>
</ul>`,
      },
      {
        title: 'Por qué Rust: ownership y "fearless concurrency"',
        html: `
<p>La gran idea: las condiciones de carrera sobre datos (<strong>data races</strong>) necesitan (1) dos o más hilos accediendo al mismo dato, (2) al menos una escritura, (3) sin sincronización. El sistema de <strong>ownership</strong> de Rust hace que esa combinación <strong>no compile</strong>:</p>
<ul>
<li>O tenés <strong>una</strong> referencia mutable (<code>&amp;mut T</code>), <strong>o</strong> muchas inmutables (<code>&amp;T</code>) — nunca ambas.</li>
<li><strong><code>Send</code></strong>: el tipo puede <strong>transferirse</strong> a otro hilo. <strong><code>Sync</code></strong>: puede <strong>compartirse por referencia</strong> (<code>&amp;T</code> es <code>Send</code>). Son marker traits que el compilador deriva y chequea.</li>
<li>Ejemplo: <code>Rc&lt;T&gt;</code> no es <code>Send</code> (contador no atómico) → usar <code>Arc&lt;T&gt;</code>. <code>RefCell</code> no es <code>Sync</code> → usar <code>Mutex</code>.</li>
</ul>
<span class="warn">Rust previene <em>data races</em> en compile-time, pero NO previene <em>race conditions</em> lógicas (ej: chequear-y-actuar en dos pasos), NI deadlocks, NI starvation. "Fearless concurrency" no es "bugless concurrency".</span>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'forkjoin',
    title: 'Fork-Join y paralelismo de datos',
    short: 'Fork-Join',
    icon: '🔱',
    color: '#4caf50',
    tag: 'Semana 2',
    tagline: 'Dividir el trabajo, juntar los resultados: rayon, work stealing, Amdahl.',
    topics: [
      {
        title: 'El modelo fork-join',
        widget: 'forkjoin-detail',
        html: `
<p>Patrón para <strong>paralelismo de datos</strong>: el problema se <strong>divide</strong> (fork) en subproblemas independientes que se resuelven en paralelo, y los resultados se <strong>combinan</strong> (join). El grafo de ejecución es un árbol: ideal para divide &amp; conquer (mergesort, wordcount, map-reduce).</p>
<p>Ejemplos de la materia: <code>mergesort.rs</code> (cada mitad se ordena en un hilo y el merge es el join) y <code>wordcountpar.rs</code> (cada hilo cuenta un pedazo del archivo y al final se suman los HashMap).</p>
<p>Clave: los subproblemas <strong>no comparten estado mutable</strong> durante la fase paralela → no hay carreras que sincronizar, solo hay que esperar los resultados.</p>`,
      },
      {
        title: 'Rayon y work stealing',
        html: `
<p>Crear un hilo del SO por subtarea es caro y no escala (mergesort recursivo = miles de tareas). <strong>Rayon</strong> usa un <strong>pool de workers</strong> (≈ uno por core) y planifica tareas livianas sobre ellos:</p>
<ul>
<li><code>par_iter()</code>: convertís un iterador en paralelo casi sin tocar el código.</li>
<li><code>join(a, b)</code>: ejecuta dos closures potencialmente en paralelo.</li>
<li><strong>Work stealing</strong>: cada worker tiene su deque de tareas; si se queda sin trabajo, <strong>roba</strong> del fondo del deque de otro. Balancea la carga sola.</li>
</ul>
<span class="tip">Rayon te garantiza el paralelismo <em>potencial</em>: si hay un solo core, <code>join(a,b)</code> simplemente corre secuencial. El programa expresa la estructura; el runtime decide cuánto paralelismo real hay.</span>`,
      },
      {
        title: 'Ley de Amdahl',
        widget: 'amdahl-detail',
        html: `
<p>Si una fracción <span class="formula">s</span> del programa es inherentemente secuencial, el speedup máximo con N procesadores es:</p>
<p><span class="formula">S(N) = 1 / (s + (1−s)/N)</span></p>
<p>Con N → ∞, el techo es <span class="formula">1/s</span>: con solo 5% secuencial, jamás pasás de 20×, tengas 8 o 8000 cores. La parte secuencial <strong>domina</strong> a medida que agregás hardware.</p>
<span class="warn">El speedup nunca es lineal en la práctica: además de Amdahl están los costos de crear/coordinar hilos, la contención en locks y la coherencia de caché. Agregar hilos puede EMPEORAR el tiempo.</span>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'estado',
    title: 'Estado compartido: corrección y locks',
    short: 'Locks',
    icon: '🔒',
    color: '#ef5350',
    tag: 'Semana 4',
    tagline: 'Race conditions, sección crítica, Mutex, Arc y atómicos.',
    topics: [
      {
        title: 'Race condition: el lost update',
        widget: 'race-detail',
        html: `
<p>El ejemplo canónico: dos hilos hacen <code>contador += 1</code>. Parece una operación, pero son <strong>tres</strong>: <strong>leer</strong> el valor a un registro, <strong>sumar</strong> 1, <strong>escribir</strong> el resultado. Entre cualquiera de esas el scheduler puede cambiar de hilo.</p>
<p>Si ambos hilos leen <strong>antes</strong> de que el otro escriba, los dos ven el mismo valor, los dos escriben lo mismo → un incremento se <strong>pierde</strong> (<em>lost update</em>). El resultado depende del entrelazado: <strong>no determinismo</strong>.</p>
<span class="warn">En Rust este código NI COMPILA con <code>&amp;mut</code> compartido — el borrow checker lo rechaza. Para escribirlo "mal" necesitás <code>unsafe</code>/<code>static mut</code>. La solución idiomática: <code>Mutex</code> o <code>AtomicUsize::fetch_add</code>.</span>`,
      },
      {
        title: 'Sección crítica y propiedades de corrección',
        html: `
<p><strong>Sección crítica</strong>: el fragmento de código que accede al recurso compartido y que debe ejecutarse <strong>de a un hilo a la vez</strong>. Toda solución al problema de la sección crítica debe cumplir:</p>
<ol>
<li><strong>Exclusión mutua</strong>: a lo sumo un hilo adentro. <em>(safety)</em></li>
<li><strong>Progreso</strong>: si nadie está adentro y alguien quiere entrar, alguien entra — la decisión no puede posponerse indefinidamente. <em>(liveness)</em></li>
<li><strong>Espera acotada (bounded waiting)</strong>: nadie espera para siempre mientras otros entran una y otra vez — sin starvation. <em>(fairness)</em></li>
</ol>
<p>En general: propiedades de <strong>safety</strong> = "nunca pasa algo malo" (se violan en un punto concreto de una ejecución); propiedades de <strong>liveness</strong> = "eventualmente pasa algo bueno" (se violan solo en ejecuciones infinitas).</p>
<span class="tip">Deadlock viola <em>liveness</em> (nadie progresa) sin violar <em>safety</em> (nadie rompió la exclusión mutua). Un programa colgado es "seguro" — y ese contraste es pregunta de oral clásica.</span>`,
      },
      {
        title: 'Mutex y Arc: compartir estado de forma segura',
        widget: 'mutex-detail',
        html: `
<p><code>Mutex&lt;T&gt;</code> en Rust <strong>encierra al dato</strong>, no solo al código: la única forma de tocar la <code>T</code> es pasar por <code>lock()</code>, que devuelve un <code>MutexGuard</code> — un smart pointer que <strong>libera el lock automáticamente al salir de scope</strong> (RAII). Imposible olvidarse del unlock.</p>
<span class="rust">let contador = Arc::new(Mutex::new(0));
for _ in 0..N {
    let c = Arc::clone(&amp;contador);
    thread::spawn(move || {
        *c.lock().unwrap() += 1;
    });
}</span>
<ul>
<li><strong><code>Arc</code></strong> (atomically reference counted): permite que <em>varios</em> hilos sean dueños del mismo dato. <code>Rc</code> no sirve: su contador no es atómico → no es <code>Send</code>.</li>
<li>El combo <code>Arc&lt;Mutex&lt;T&gt;&gt;</code> = <strong>compartir</strong> (Arc) + <strong>mutar con exclusión</strong> (Mutex).</li>
<li><code>lock()</code> devuelve <code>Err</code> si otro hilo hizo panic con el lock tomado: el mutex queda <strong>envenenado</strong> (poisoned) — el dato podría haber quedado inconsistente.</li>
</ul>
<span class="warn">Mantené la sección crítica CORTA. Todo lo que hacés con el lock tomado serializa el programa (Amdahl te cobra). Y nunca hagas I/O o esperas largas con un lock tomado.</span>`,
      },
      {
        title: 'RwLock: muchos lectores O un escritor',
        widget: 'rwlock-detail',
        html: `
<p><code>RwLock&lt;T&gt;</code> distingue accesos: <code>read()</code> permite <strong>N lectores simultáneos</strong>; <code>write()</code> exige <strong>exclusividad total</strong>. Ideal cuando las lecturas dominan (configuración, caches, tablas de rutas).</p>
<ul>
<li>Regla: <em>muchos lectores</em> XOR <em>un escritor</em> — espeja la regla de referencias del borrow checker (<code>&amp;T</code> múltiples XOR <code>&amp;mut T</code> única), pero chequeada en runtime.</li>
<li>Riesgo: <strong>starvation del escritor</strong> si los lectores llegan sin parar. Las implementaciones suelen priorizar escritores encolados para evitarlo.</li>
</ul>`,
      },
      {
        title: 'Atómicos: sincronización sin locks',
        html: `
<p>Para datos chicos (contadores, flags) hay operaciones de hardware indivisibles: <code>AtomicUsize</code>, <code>AtomicBool</code>, etc. <code>fetch_add(1, Ordering::SeqCst)</code> hace el leer-sumar-escribir <strong>en una sola operación atómica</strong> — sin lock, sin bloqueo, sin lost update.</p>
<ul>
<li>Mucho más baratos que un Mutex, pero solo para operaciones simples sobre un valor.</li>
<li>El <code>Ordering</code> (Relaxed, Acquire/Release, SeqCst) controla qué reordenamientos de memoria se permiten. Regla práctica de la materia: <code>SeqCst</code> hasta que sepas exactamente por qué relajarlo.</li>
</ul>
<span class="tip">Jerarquía para el oral: ¿un contador? atomic. ¿una estructura? Mutex. ¿lecturas dominantes? RwLock. ¿evitás compartir directamente? canales/actores.</span>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'sincro',
    title: 'Sincronización',
    short: 'Sincronización',
    icon: '🚦',
    color: '#f68c1f',
    tag: 'Semana 5',
    tagline: 'Semáforos, condvars, barreras, monitores — y el deadlock al acecho.',
    topics: [
      {
        title: 'Semáforos y productor-consumidor',
        widget: 'sem-detail',
        html: `
<p>El <strong>semáforo</strong> (Dijkstra) es un contador de <strong>permisos</strong> con dos operaciones atómicas: <code>acquire()</code> / P / wait — si el contador es 0, <strong>bloquea</strong>; si no, decrementa y sigue — y <code>release()</code> / V / signal — incrementa y despierta a un bloqueado si lo hay.</p>
<ul>
<li>Con valor inicial 1 es un <strong>semáforo binario</strong> (≈ mutex, pero sin dueño: cualquiera puede hacer release — más flexible y más peligroso).</li>
<li>Con valor inicial N limita a N usuarios simultáneos de un recurso (pool de conexiones, estacionamiento).</li>
</ul>
<p>Su aplicación estrella: <strong>productor-consumidor con buffer acotado</strong>. Dos semáforos que cuentan cosas distintas — <code>vacios = N</code> (lugares libres) y <code>llenos = 0</code> (ítems disponibles) — más un mutex para el acceso al buffer. El productor hace <code>vacios.acquire() → lock → push → unlock → llenos.release()</code>; el consumidor, simétrico.</p>
<span class="warn">El ORDEN importa: semáforo PRIMERO, mutex DESPUÉS. Si tomás el mutex y recién ahí esperás el semáforo, te dormís CON el lock en la mano y el otro lado nunca puede avanzar → deadlock. Probalo en la simulación con el toggle.</span>`,
      },
      {
        title: 'Condition variables: esperar sin quemar CPU',
        widget: 'condvar-detail',
        html: `
<p>Problema: un hilo necesita esperar a que una <strong>condición sobre el estado compartido</strong> sea cierta ("hay trabajo", "arrancó el sistema"). Chequearla en un loop (<strong>busy-waiting</strong>) quema CPU y compite con el hilo que debe hacerla cierta.</p>
<p>La <strong>condition variable</strong> permite <strong>dormir hasta que te avisen</strong>: <code>wait(guard)</code> <strong>suelta el lock y duerme, atómicamente</strong>; al despertar, <strong>re-adquiere el lock</strong> antes de devolver el control. <code>notify_one()</code> / <code>notify_all()</code> despiertan a quien espera.</p>
<span class="rust">let (lock, cvar) = &amp;*par;
let mut started = lock.lock().unwrap();
while !*started {
    started = cvar.wait(started).unwrap();
}</span>
<span class="warn">SIEMPRE <code>while</code>, nunca <code>if</code>: existen los <strong>spurious wakeups</strong> (despertares espurios) y además otro hilo pudo colarse y falsificar la condición entre el notify y tu re-adquisición del lock. La condición se re-chequea con el lock en mano.</span>
<p>Mutex + condvars + la disciplina de "toda la espera y el aviso pasan por el lock" = un <strong>monitor</strong> (Hoare): el patrón que los lenguajes modernos empaquetan como objeto.</p>`,
      },
      {
        title: 'Barreras: todos esperan a todos',
        html: `
<p><code>Barrier::new(n)</code>: cada hilo que llama a <code>wait()</code> se bloquea hasta que hayan llegado los <code>n</code>. Ahí se destraban <strong>todos juntos</strong> (a uno le toca ser <em>leader</em>, útil para trabajo único entre fases).</p>
<p>Uso típico: algoritmos por <strong>fases/iteraciones</strong> (simulaciones, cómputo científico): nadie arranca la fase k+1 hasta que todos terminaron la fase k. Es el "join" de fork-join pero <strong>reutilizable</strong> sin matar los hilos.</p>`,
      },
      {
        title: 'Deadlock: las 4 condiciones de Coffman y los filósofos',
        widget: 'deadlock-detail',
        html: `
<p><strong>Deadlock</strong>: un conjunto de hilos donde cada uno espera un recurso que tiene otro del conjunto → <strong>ciclo de espera</strong>, nadie avanza jamás. Requiere las <strong>4 condiciones de Coffman</strong>, todas a la vez:</p>
<ol>
<li><strong>Exclusión mutua</strong>: los recursos no se comparten.</li>
<li><strong>Hold and wait</strong>: retener un recurso mientras se espera otro.</li>
<li><strong>Sin desalojo (no preemption)</strong>: nadie te quita un recurso; lo soltás vos.</li>
<li><strong>Espera circular</strong>: T1 espera a T2, …, Tn espera a T1.</li>
</ol>
<p>Romper <strong>cualquiera</strong> de las cuatro previene el deadlock. Los <strong>filósofos comensales</strong> (Dijkstra) son el ejemplo canónico: 5 filósofos, 5 tenedores, cada uno necesita los 2 vecinos para comer. Si todos agarran el izquierdo a la vez → ciclo perfecto.</p>
<ul>
<li><strong>Orden global de recursos</strong> (un filósofo zurdo/asimétrico): rompe la espera circular.</li>
<li><strong>Mozo/tickets (máx N−1 sentados)</strong>: rompe la posibilidad del ciclo completo — es un semáforo con N−1 permisos.</li>
<li><strong><code>try_lock</code> + soltar todo y reintentar</strong>: rompe hold-and-wait… pero puede degenerar en <strong>livelock</strong> (todos sueltan y reintentan sincronizados, nadie come — se mueven pero no progresan).</li>
</ul>
<span class="tip">Deadlock vs livelock vs starvation: en deadlock nadie se mueve; en livelock se mueven pero no progresan; en starvation el sistema progresa pero UNO tiene mala suerte sistemáticamente. Las tres violan liveness.</span>`,
      },
      {
        title: 'Los otros clásicos: barbero y fumadores',
        html: `
<p>Problemas de sincronización que la materia usa para ejercitar semáforos y condvars (están en <code>5-sincronizacion/examples</code>):</p>
<ul>
<li><strong>Barbero dormilón</strong>: un barbero atiende de a uno; sala de espera con K sillas. Si no hay clientes, duerme; si llega un cliente y está dormido, lo despierta; si no hay sillas, el cliente se va. Ejercita: contar recursos (sillas) + avisar eventos (llegó cliente / terminó corte) sin perder avisos.</li>
<li><strong>Fumadores</strong>: un agente pone 2 de 3 ingredientes; debe despertar exactamente al fumador que tiene el tercero. Ejercita: el problema de despertar <em>al que corresponde</em> — con un semáforo por fumador, no un notify_all a ciegas.</li>
</ul>
<p><em>(Lector-escritor está en la sección de Locks como RwLock; filósofos, arriba.)</em></p>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'petri',
    title: 'Redes de Petri',
    short: 'Petri',
    icon: '⚪',
    color: '#a78bfa',
    tag: 'Semana 6',
    tagline: 'Modelar y verificar concurrencia formalmente: lugares, transiciones, tokens.',
    topics: [
      {
        title: 'El modelo: lugares, transiciones, tokens',
        widget: 'petri-detail',
        html: `
<p>Una <strong>red de Petri</strong> es un grafo dirigido <strong>bipartito</strong>. La <strong>red ordinaria</strong> es <span class="formula">PN = (T, P, A)</span>: <strong>transiciones</strong> <code>T</code> (barras — los <strong>eventos</strong> que cambian el estado), <strong>lugares</strong> <code>P</code> (círculos — los <strong>estados</strong>/condiciones) y <strong>arcos</strong> <code>A ⊆ (T×P) ∪ (P×T)</code> — siempre de lugar a transición o viceversa, nunca entre iguales.</p>
<ul>
<li>La <strong>función de marca</strong> <span class="formula">M : P → ℕ∪0</span> dice cuántos <strong>tokens</strong> hay en cada lugar. El vector M es LA foto del estado del sistema; <code>M₀</code> es el marcado inicial.</li>
<li>Cada transición tiene sus lugares de <strong>entrada</strong> <code>I(t)</code> y de <strong>salida</strong> <code>O(t)</code>.</li>
<li>La <strong>red general</strong> agrega pesos: <span class="formula">PN = (T, P, A, W, M₀)</span> con <code>W : A → ℕ</code>. Regla de disparo: t está <strong>habilitada</strong> ⟺ <span class="formula">M(p) ≥ W(p,t) ∀p ∈ I(t)</span>. Al disparar consume <code>W(p,t)</code> de cada entrada y produce <code>W(t,p')</code> en cada salida — atómicamente.</li>
<li>El no determinismo es explícito: si varias están habilitadas, <em>cualquiera</em> puede disparar. Eso ES la concurrencia en el modelo.</li>
</ul>
<span class="tip">Interpretaciones típicas (tabla de la teórica): lugares de entrada = precondiciones / datos / buffers de entrada; transiciones = eventos / cómputos / procesador; lugares de salida = postcondiciones / datos de salida.</span>`,
      },
      {
        title: 'Grafo de alcance: verificar sin ejecutar',
        widget: 'reach-detail',
        html: `
<p>El <strong>grafo de alcance</strong> tiene un nodo por cada <strong>marcado alcanzable</strong> desde M₀ y una arista por cada disparo posible. Es el "mapa de todos los futuros" del sistema, y sobre él se <strong>verifican propiedades</strong> sin ejecutar nada:</p>
<ul>
<li><strong>Acotación</strong>: la red es <em>k-acotada</em> si ningún lugar supera k tokens en ningún marcado alcanzable (grafo finito). El Ejemplo 2 de la teórica NO es acotada: un lugar crece sin límite → grafo infinito. Modelando un buffer, eso es un buffer que explota.</li>
<li><strong>Deadlock</strong>: un <strong>marcado muerto</strong> = nodo sin aristas de salida (ninguna transición habilitada). Si no existe ninguno y siempre se puede seguir disparando, la red es <strong>viva</strong>.</li>
<li><strong>Reversibilidad</strong>: ¿desde todo marcado se puede volver a M₀?</li>
<li><strong>Exclusión mutua</strong>: ¿existe algún marcado alcanzable con tokens en P3 y P4 a la vez? Si no existe, la exclusión está <strong>demostrada</strong> — para todos los entrelazados posibles.</li>
</ul>
<span class="warn">"Lo probé mil veces y nunca se colgó" vs "el grafo de alcance no tiene marcados muertos": lo primero es evidencia anecdótica, lo segundo es una DEMOSTRACIÓN. Ese contraste es exactamente lo que la materia quiere que digas en el oral.</span>`,
      },
      {
        title: 'Los modelos de la práctica (PIPE)',
        html: `
<p>En la práctica se modela con <strong>PIPE</strong> y se analizan las redes de siempre (los <code>.xml</code> del repo):</p>
<ul>
<li><strong>Mutex</strong>: el lock es un LUGAR con un token (P2). Entrar a la CS = transición que consume de "afuera" Y del lock; salir = transición que devuelve ambos. La exclusión se verifica en el grafo de alcance: no existe marcado con los dos procesos en la CS.</li>
<li><strong>Productor-consumidor acotado</strong>: dos lugares complementarios — <code>buffer</code> (ítems) y <code>libres</code> (con N tokens iniciales). Depositar consume un "libre" y produce un "ítem"; retirar, al revés. La suma es invariante = N: el buffer jamás desborda, demostrado.</li>
<li><strong>Barbero y filósofos</strong>: los tokens en un lugar cuentan clientes esperando / tenedores libres; el deadlock de los filósofos aparece como marcado muerto en el grafo.</li>
<li><strong>Banquero</strong>: los recursos disponibles son tokens; asignar/liberar los mueve con pesos.</li>
</ul>
<p><strong>Lector-escritor necesita más poder</strong>: "el escritor entra solo si NO hay lectores" es una condición de <em>cero</em>, y las redes clásicas solo testean "hay al menos W(p,t)". Se extiende con el <strong>arco inhibidor</strong> (termina en un circulito): habilita la transición solo si su lugar está <strong>vacío</strong>.</p>
<span class="warn">El arco inhibidor no es un detalle: le da a las redes de Petri poder de Turing y hace la verificación general indecidible. "¿Por qué lector-escritor no sale con una red ordinaria?" es pregunta de oral — respuesta: porque no se puede testear vacío.</span>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'mensajes',
    title: 'Canales y actores',
    short: 'Mensajes',
    icon: '📬',
    color: '#58a6ff',
    tag: 'Semana 7',
    tagline: '"No compartas memoria para comunicarte: comunicate para compartir memoria."',
    topics: [
      {
        title: 'Canales mpsc',
        widget: 'mpsc-detail',
        html: `
<p>Alternativa al estado compartido: los hilos se pasan <strong>mensajes</strong> por un canal. En Rust, <code>std::sync::mpsc</code>: <strong>multiple producer, single consumer</strong>. El <code>Sender</code> se clona para N productores; el <code>Receiver</code> es único.</p>
<ul>
<li>El mensaje <strong>transfiere ownership</strong>: después del <code>send(dato)</code>, el productor ya no puede tocarlo. El borrow checker convierte "no compartas memoria" en regla compilada.</li>
<li><code>recv()</code> bloquea hasta que haya mensaje; devuelve <code>Err</code> cuando <strong>todos</strong> los senders se droppearon (así se detecta el fin — cerrar el canal es el "join" natural).</li>
<li>Variante acotada: <code>sync_channel(N)</code> — si el buffer está lleno, <code>send()</code> bloquea: <strong>backpressure</strong> gratis.</li>
</ul>`,
      },
      {
        title: 'Modelo de actores',
        widget: 'actors-detail',
        html: `
<p>Un <strong>actor</strong> = estado privado + <strong>mailbox</strong> + comportamiento. Nadie toca su estado: solo le mandan <strong>mensajes</strong>, que procesa <strong>de a uno</strong> — la exclusión mutua sale gratis de la secuencialidad, sin locks. Al procesar puede: mutar su estado, crear actores, mandar mensajes.</p>
<p>En la materia se usa <strong>Actix</strong>: cada actor corre en un <code>Context</code>, los mensajes tipados implementan <code>Message</code> y el actor los maneja con <code>Handler&lt;M&gt;</code>.</p>
<span class="tip">¿Por qué los actores no necesitan Mutex? Porque el estado es privado y el mailbox serializa el acceso: procesar de a un mensaje ES la exclusión mutua. El precio: todo pasa a ser asincrónico y hay que diseñar los mensajes.</span>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'async',
    title: 'Async/await',
    short: 'Async',
    icon: '⚡',
    color: '#ffd54f',
    tag: 'Semana 3',
    tagline: 'Miles de tareas de I/O sin miles de hilos: futures, poll, executor.',
    topics: [
      {
        title: 'El problema de los threads',
        html: `
<p>Un hilo del SO no es gratis: cada uno reserva su <strong>stack</strong> — típicamente ~100 kB, en Linux desde 20 kB. Si una aplicación crea miles de hilos (un servidor con miles de conexiones abiertas), la <strong>demanda de memoria</strong> se vuelve el cuello de botella, mucho antes que la CPU.</p>
<p>Y la mayoría de esos hilos ni siquiera están trabajando: están <strong>bloqueados en una system call</strong> esperando la red o el disco. Mirá el timeline de una request sincrónica típica: <code>connect</code>, <code>write_all</code>, <code>read_to_string</code> — entre cada una, el hilo pasa la mayor parte del tiempo en <strong>waiting</strong>, sin poder hacer otra cosa.</p>
<span class="tip">La comparación numérica de la cátedra: crear un thread en Linux ≈ 15 µs; crear una tarea async ≈ 300 ns. Y el cambio de contexto entre tareas async es más barato que entre threads. Para I/O masivo, async gana por varios órdenes de magnitud.</span>`,
      },
      {
        title: 'Tareas asincrónicas de Rust',
        html: `
<p>Las <strong>tareas asincrónicas</strong> intercalan trabajo en un único thread (o en un pool chico). Son mucho más <strong>livianas</strong> que los threads, más rápidas de crear y con menos overhead de memoria → podés tener <strong>miles o decenas de miles</strong> en un programa.</p>
<p>Lo lindo: el código async <strong>se parece</strong> al sincrónico. Es casi el mismo, salvo las operaciones que bloquean, que se manejan distinto. Compará el acceptor de un servidor:</p>
<span class="rust">// sincrónico — un thread por conexión
for socket in listener.incoming() {
    let groups = chat_table.clone();
    thread::spawn(|| serve(socket?, groups));
}

// asincrónico — una TAREA por conexión
let mut conns = listener.incoming();
while let Some(socket) = conns.next().await {
    let groups = chat_table.clone();
    task::spawn(async { serve(socket?, groups).await });
}</span>
<p>Mismo esqueleto: el <code>.await</code> marca dónde la tarea puede ceder el control, y <code>spawn</code> lanza tareas en vez de hilos.</p>`,
      },
      {
        title: 'Futures: el modelo piñata',
        widget: 'poll-detail',
        html: `
<p>Rust modela "un resultado que todavía no está" con el trait <code>Future</code>:</p>
<span class="rust">trait Future {
    type Output;
    fn poll(self: Pin&lt;&amp;mut Self&gt;, cx: &amp;mut Context) -&gt; Poll&lt;Self::Output&gt;;
}
enum Poll&lt;T&gt; { Ready(T), Pending }</span>
<ul>
<li><code>poll()</code> pregunta "¿ya terminaste?". Devuelve <code>Ready(output)</code> si sí, <code>Pending</code> si todavía no. <strong>Nunca bloquea</strong>: contesta al toque y se va.</li>
<li>Modelo <strong>piñata</strong> 🪅 de la cátedra: lo único que podés hacer con un future es <strong>pegarle con poll</strong> hasta que caiga el valor. Cada poll <strong>avanza todo lo que puede</strong> y guarda el estado para el próximo.</li>
<li>El SO provee las system calls (epoll/kqueue) que dicen <em>cuándo</em> vale la pena pollear de nuevo — no se pollea a lo loco.</li>
</ul>
<p>El crate <strong><code>async-std</code></strong> provee versiones async de la I/O de la std (incluido un <code>Read</code> asincrónico). La animación sigue el <code>cheapo_request</code> de la teórica poll por poll.</p>`,
      },
      {
        title: 'async fn y expresiones await',
        html: `
<p>Al compilar, una <code>async fn</code> se transforma en una <strong>máquina de estados</strong>. Los puntos clave:</p>
<ul>
<li>Invocar una async fn <strong>retorna inmediatamente</strong>, antes de ejecutar el cuerpo: devuelve un <code>Future</code> que guarda los argumentos y el espacio para las variables locales.</li>
<li>Al pollearla la primera vez, se ejecuta el cuerpo <strong>hasta el primer <code>await</code></strong>. Si el sub-future no está listo, retorna <code>Pending</code> y la función entera devuelve Pending.</li>
<li>La expresión <code>await</code> toma ownership del future, le hace poll: si da <code>Ready</code>, el valor se desenvuelve y la ejecución <strong>continúa</strong>; si da <code>Pending</code>, propaga Pending a quien la invocó.</li>
<li>El future <strong>almacena el punto donde retomar</strong>: el siguiente poll continúa desde ese await, no desde el principio. Por eso las variables locales viven adentro del future, no en el stack.</li>
</ul>
<span class="warn">Las expresiones <code>await</code> solo se pueden usar dentro de funciones <code>async</code>. Tiene sentido: son justamente los puntos donde la función necesita poder pausarse y ceder — algo que una función sincrónica común no sabe hacer.</span>`,
      },
      {
        title: 'Executors: block_on, spawn y el pool',
        widget: 'async-detail',
        html: `
<p>Las futures son perezosas: <strong>alguien tiene que pollearlas</strong>. Ese alguien es el <strong>executor</strong>.</p>
<ul>
<li><strong><code>block_on(future)</code></strong>: función <strong>sincrónica</strong> que corre un future hasta obtener su valor final. Es el <em>adaptador</em> del mundo async al sincrónico (típicamente en <code>main</code>). Sabe cuánto dormir entre polls gracias al waker — no hace busy-waiting. <span class="warn">Nunca lo llames dentro de una función async: bloquea el thread entero y con él todas las demás tareas.</span></li>
<li><strong><code>task::spawn_local(future)</code></strong>: agrega un future al pool que el <code>block_on</code> ya está corriendo, para que se pollee <em>junto con</em> los demás. Análogo a <code>thread::spawn</code>, pero las tareas comparten thread. Los lifetimes deben ser <code>'static</code>.</li>
<li><strong><code>task::spawn(future)</code></strong>: lo coloca en un <strong>pool de threads</strong> dedicado a pollear futures — no necesita un block_on aparte.</li>
</ul>
<p>La clave: el cambio de una tarea a otra ocurre <strong>solo en los <code>await</code></strong>. Toda la ejecución async es en realidad una serie de llamadas sincrónicas a <code>poll</code> que retornan rápido. La animación muestra el executor repartiendo un thread entre tres tareas — y qué pasa si una lo acapara.</p>`,
      },
      {
        title: 'Cómputos largos: no bloquees al executor',
        html: `
<p>El talón de Aquiles del modelo cooperativo: como el cambio de tarea <strong>solo ocurre en un <code>await</code></strong>, una función que hace un <strong>cómputo largo sin awaits</strong> no le da lugar a ninguna otra tarea. El executor queda preso.</p>
<p>Las dos herramientas para eso:</p>
<ul>
<li><strong><code>task::yield_now().await</code></strong>: favorece el paralelismo cediendo voluntariamente el control. La primera vez que se pollea retorna <code>Pending</code> (y se re-agenda); la siguiente, <code>Ready(())</code>. Sirve para intercalar un loop pesado.</li>
<li><strong><code>task::spawn_blocking(closure)</code></strong>: manda el trabajo bloqueante o pesado a <strong>otro thread del SO</strong> dedicado, para no congelar el executor.</li>
</ul>
<span class="warn">Regla mental de la cátedra (el meme de Drake): async <strong>SÍ</strong> para consultar servicios externos, leer archivos, servir requests HTTP. Async <strong>NO</strong> para calcular un factorial, multiplicar matrices, los filósofos o estado compartido con locks — eso es CPU y va con threads/rayon.</span>`,
      },
      {
        title: 'El tipo Pin (por qué existe)',
        html: `
<p>La máquina de estados de una async fn suele contener <strong>referencias a sus propias variables locales</strong> (self-references): un puntero que apunta a otro campo del mismo future. Si ese future se <strong>moviera</strong> en memoria, el puntero quedaría apuntando a la dirección vieja → basura.</p>
<ul>
<li>Por eso <code>poll</code> recibe <code>Pin&lt;&amp;mut Self&gt;</code>: <strong><code>Pin</code></strong> es una promesa de que el valor <strong>no se va a mover</strong> de su lugar en memoria.</li>
<li>Casi todos los tipos implementan el auto-trait <strong><code>Unpin</code></strong> (como <code>Send</code>/<code>Sync</code>): para ellos Pin no cambia nada. Solo los tipos marcados <code>!Unpin</code> —como los futures con self-references— quedan realmente "clavados".</li>
<li>Con un <code>!Unpin</code>, Pin hace <strong>imposible</strong> llamar métodos que necesiten <code>&amp;mut T</code> y podrían moverlo (como <code>mem::swap</code>).</li>
</ul>
<span class="tip">Para el oral alcanza con el "por qué": los futures se auto-referencian, moverlos rompería esos punteros, y Pin es la garantía a nivel de tipos de que no se muevan. No hace falta pelear con la API de Pin — hace falta explicar el problema que resuelve.</span>`,
      },
    ],
  },
  /* ================================================================ */
  {
    slug: 'distribuidos',
    title: 'Sistemas distribuidos',
    short: 'Distribuidos',
    icon: '🌐',
    color: '#4dd0e1',
    tag: 'Semanas 8–11',
    tagline: 'Cuando los hilos son procesos en máquinas distintas y los mensajes se pierden.',
    topics: [
      {
        title: 'Qué cambia al distribuir',
        html: `
<p>Concurrencia distribuida = los "hilos" son procesos en máquinas distintas que solo se comunican por <strong>red (sockets)</strong>. Desaparecen las herramientas de memoria compartida (no hay Mutex global) y aparecen problemas nuevos: <strong>mensajes que se pierden o demoran</strong>, <strong>nodos que se caen</strong>, y <strong>nadie tiene el reloj ni la foto global</strong> del sistema.</p>
<p>Los tres grandes problemas que ve la materia: <strong>exclusión mutua distribuida</strong> (centralizado, token ring, Ricart-Agrawala), <strong>elección de líder</strong> (ring, bully) y <strong>transacciones/commit atómico</strong> (two-phase commit).</p>
<span class="tip">El salto conceptual: en memoria compartida, la sincronización la da el hardware (instrucciones atómicas). En distribuido TODO se construye con mensajes que pueden perderse y demorarse — y un nodo lento es indistinguible de uno muerto (por eso los timeouts son la herramienta universal de detección de fallas… imperfecta).</span>`,
      },
      {
        title: 'Exclusión mutua distribuida',
        widget: 'distmutex-detail',
        html: `
<p>El mismo problema de la sección crítica, sin memoria compartida. Los tres enfoques clásicos:</p>
<ul>
<li><strong>Centralizado</strong> (<code>centralizedmutex.rs</code>): un coordinador con una cola. REQUEST → GRANT → RELEASE: solo <strong>3 mensajes por acceso</strong>, orden justo. Contras: cuello de botella y <strong>single point of failure</strong>.</li>
<li><strong>Token ring</strong> (<code>tokenring.rs</code>): un único <strong>token</strong> circula por el anillo; solo su portador entra a la CS. No hay coordinador ni starvation (el token pasa por todos). Contras: mensajes constantes aunque nadie quiera entrar, y si el portador muere hay que <strong>detectar y regenerar el token</strong> (garantizando que no queden dos).</li>
<li><strong>Ricart-Agrawala</strong>: pedís permiso a TODOS con timestamp lógico y entrás cuando todos te dieron OK (2(n−1) mensajes por acceso). Totalmente distribuido, pero un solo nodo caído te frena — necesita que todos respondan.</li>
</ul>
<span class="warn">"¿El token ring garantiza exclusión mutua?" Sí, trivialmente: hay UN token. Las preguntas con trampa son las de fallas: ¿qué pasa si se pierde el token? ¿y si por un bug de regeneración aparecen dos?</span>`,
      },
      {
        title: 'Elección de líder: anillo y bully',
        widget: 'leader-detail',
        html: `
<p>Muchos algoritmos distribuidos necesitan un <strong>coordinador</strong> (el centralizado de arriba, 2PC…). Cuando muere, hay que elegir otro: típicamente <strong>el vivo de mayor id</strong>. La elección arranca cuando un nodo <strong>detecta por timeout</strong> que el líder no responde.</p>
<ul>
<li><strong>Anillo</strong> (<code>ring.rs</code>): el mensaje ELECTION da la vuelta juntando ids vivos; al volver al iniciador se conoce el máximo, y una segunda vuelta (COORDINATOR) lo anuncia. Costo predecible: <strong>O(n)</strong> — unas 2n hops.</li>
<li><strong>Bully</strong> (<code>bully.rs</code>): mandás ELECTION a todos los ids <strong>mayores</strong> que vos. Si alguno responde OK, te bajás y él sigue. El que no recibe OK se proclama con COORDINATOR. Peor caso <strong>O(n²)</strong> (inicia el más chico), mejor caso O(n). Y si un nodo con id alto revive, <strong>"apura" al líder actual</strong> y se queda con el puesto — de ahí el nombre.</li>
</ul>
<span class="tip">Pregunta clásica: ¿pueden quedar DOS líderes? Con partición de red (o timeouts mal calibrados), sí — cada mitad elige el suyo. Los algoritmos de la materia asumen fallas limpias (crash-stop) y red confiable; el caso general es el problema de consenso.</span>`,
      },
      {
        title: 'Transacciones distribuidas: two-phase commit',
        widget: 'twophase-detail',
        html: `
<p>Una transacción toca datos en varios nodos y debe ser <strong>atómica</strong>: commitean <strong>todos o ninguno</strong>. 2PC lo resuelve con un coordinador y dos fases (<code>twophase_coordinator.rs</code> / <code>twophase_stakeholder.rs</code>):</p>
<ol>
<li><strong>Votación</strong>: PREPARE a todos. Cada participante deja todo listo, lo escribe en su <strong>log durable</strong> (write-ahead) y vota SÍ o NO. Votar SÍ es una <strong>promesa</strong>: "puedo commitear aunque me caiga y me reinicie".</li>
<li><strong>Decisión</strong>: todos SÍ → COMMIT; algún NO o timeout → ABORT. El coordinador <strong>escribe la decisión en su log antes de enviarla</strong>; la decisión es irreversible.</li>
</ol>
<ul>
<li>El que vota NO puede abortar unilateralmente (nada puede terminar en commit sin su SÍ).</li>
<li>El que votó SÍ queda <strong>en estado incierto</strong>: ya no puede decidir solo — con los locks tomados.</li>
</ul>
<span class="warn">La debilidad famosa: 2PC es <strong>BLOQUEANTE</strong>. Si el coordinador muere después de juntar los votos y antes de comunicar la decisión, los participantes inciertos quedan clavados (con locks) hasta que vuelva. Por eso existen 3PC y los protocolos de consenso (Paxos/Raft) — probalo en la simulación.</span>`,
      },
      {
        title: 'Deadlock distribuido',
        html: `
<p>Con transacciones tomando locks en varios nodos, el deadlock reaparece — pero ahora <strong>nadie ve el grafo de espera completo</strong>: cada nodo conoce solo sus aristas. Estrategias:</p>
<ul>
<li><strong>Detección</strong>: construir el grafo global (un detector central que junta los grafos locales, o <em>edge chasing</em>: mensajes <em>probe</em> que siguen las cadenas de espera; si tu probe te vuelve, hay ciclo → abortás una transacción víctima).</li>
<li><strong>Prevención por timestamps</strong> — comparando la "edad" de las transacciones: <strong>wait-die</strong> (el viejo espera; el joven muere y reintenta) y <strong>wound-wait</strong> (el viejo "hiere" al joven y le saca el lock). Ambos rompen la espera circular imponiendo un orden global por edad.</li>
<li><strong>Timeouts</strong>: lo más usado en la práctica — esperaste demasiado un lock, abortá y reintentá. Simple, con falsos positivos.</li>
</ul>
<span class="tip">Conexión con Coffman: todas estas técnicas atacan la <strong>espera circular</strong>, igual que el orden global de recursos en los filósofos — pero acá el ciclo hay que descubrirlo (o prevenirlo) con mensajes, porque no hay memoria compartida donde mirarlo.</span>`,
      },
    ],
  },
];
