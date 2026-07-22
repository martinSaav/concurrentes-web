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
    | 'reach-detail'
    | 'memory-detail'; // componentes a medida
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
        title: 'Definiciones fundamentales',
        html: `
<ul>
<li><strong>Programa</strong>: conjunto de datos, asignaciones e instrucciones de control de flujo que compilan a instrucciones de máquina, se ejecutan <strong>secuencialmente</strong> en un procesador y acceden a datos en memoria.</li>
<li><strong>Programa concurrente</strong>: conjunto <strong>finito</strong> de programas secuenciales que pueden ejecutarse <strong>en paralelo</strong>.</li>
<li><strong>Proceso</strong>: cada uno de los programas secuenciales que conforman el programa concurrente. Están compuestos por un conjunto finito de <strong>instrucciones atómicas</strong>.</li>
<li><strong>Ejecución del programa concurrente</strong>: la secuencia de instrucciones atómicas que resulta de <strong>intercalar arbitrariamente</strong> las instrucciones atómicas de los procesos que lo componen. Esta definición es la clave de todo: "arbitrariamente" es de donde sale el no determinismo.</li>
<li><strong>Sistema paralelo</strong>: varios programas ejecutándose simultáneamente en <strong>procesadores distintos</strong>.</li>
<li><strong>Multitasking</strong>: ejecución de múltiples procesos concurrentemente en un período; el <strong>scheduler</strong> (parte del kernel del SO) coordina el acceso a los procesadores.</li>
<li><strong>Multithreading</strong>: construcción provista por el lenguaje que permite ejecución concurrente de <strong>threads dentro del mismo programa</strong>.</li>
</ul>
<p>Y los dos problemas que atraviesan la materia entera:</p>
<ul>
<li><strong>Sincronización</strong>: coordinación <strong>temporal</strong> entre procesos (quién puede avanzar y cuándo).</li>
<li><strong>Comunicación</strong>: los <strong>datos</strong> que los procesos necesitan compartir para cumplir la función del programa.</li>
</ul>
<span class="tip">Sincronización y comunicación son las dos complejidades que se vuelven <em>mucho</em> más difíciles al pasar a sistemas distribuidos: sin memoria compartida ni reloj común, ambas hay que construirlas con mensajes que pueden perderse.</span>`,
      },
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
        title: 'Los 5 modelos de concurrencia',
        html: `
<p>Toda la materia se puede leer como el recorrido por <strong>cinco modelos</strong> para estructurar un programa concurrente. Elegir el modelo correcto para el problema es la decisión de diseño más importante:</p>
<div class="tablewrap"><table>
<tr><th>Modelo</th><th>Idea</th><th>Ideal para</th><th>Desventaja</th></tr>
<tr><td>1 · Estado mutable compartido</td><td>Procesos comparten variables; se serializa el acceso con locks a las regiones que no pueden superponerse</td><td>Bases de datos en memoria, servidores multicliente que escriben la misma estructura, juegos en red</td><td>Hay que proteger cada acceso; los locks pueden ralentizar el sistema y traen carreras/deadlocks</td></tr>
<tr><td>2 · Fork-Join</td><td>La tarea se parte en subtareas <strong>independientes</strong> (fork), se resuelven en paralelo y se unen (join)</td><td>Cómputo científico, datos masivos, algoritmos recursivos (mergesort, búsqueda en grafos), procesamiento de imágenes</td><td>Requiere que las subtareas sean independientes: no aplica a todos los problemas</td></tr>
<tr><td>3 · Canales / Mensajes</td><td>Vías de comunicación entre procesos: en vez de compartir memoria, se transmite información</td><td>Sistemas distribuidos, microservicios, pipelines de procesamiento, monitoreo de sensores</td><td>Complejidad en coordinar los mensajes</td></tr>
<tr><td>4 · Asincrónico</td><td>Muchas tareas colaborativas en pocos threads; nadie bloquea al esperar I/O</td><td>Servidores web con miles de peticiones, apps que consumen APIs externas, cualquier cosa I/O-bound</td><td>Difícil de leer si se abusa de callbacks o promesas mal estructuradas</td></tr>
<tr><td>5 · Actores</td><td>Entidad con estado privado + buzón; solo ella muta su estado, procesando mensajes de a uno</td><td>Juegos (cada NPC un actor), chats, simuladores de tráfico</td><td>Cuellos de botella en actores muy activos; malo si los actores dependen fuerte entre sí</td></tr>
</table></div>
<span class="tip">La progresión conceptual: los modelos 1 y 2 comparten memoria (y el 2 evita el problema haciendo las tareas independientes); los modelos 3, 4 y 5 lo evitan comunicándose. De ahí el lema: <em>"no compartas memoria para comunicarte; comunicate para compartir memoria"</em>.</span>`,
      },
      {
        title: 'Procesos vs threads',
        widget: 'memory-detail',
        html: `
<div class="tablewrap"><table>
<tr><th></th><th>Proceso</th><th>Thread (hilo)</th></tr>
<tr><td>Definición</td><td>Programa en ejecución</td><td>Subunidad de ejecución de un proceso</td></tr>
<tr><td>Memoria</td><td>Tiene su <strong>propio</strong> espacio de memoria</td><td><strong>Comparte</strong> la memoria del proceso</td></tr>
<tr><td>Independencia</td><td>Totalmente independiente</td><td>Depende del proceso y de los otros hilos</td></tr>
<tr><td>Costo de creación</td><td>Alto</td><td>Bajo (liviano)</td></tr>
<tr><td>Comunicación</td><td>Difícil: IPC (pipes, sockets…)</td><td>Fácil: variables y memoria compartidas</td></tr>
<tr><td>Fallos</td><td>Si uno muere, no afecta a los otros</td><td>Si uno falla, puede tumbar todo el proceso</td></tr>
</table></div>
<p>Los threads comparten el <strong>heap</strong> y los segmentos de memoria global del proceso, pero cada uno tiene su <strong>propio stack</strong> (variables locales, dirección de retorno, temporales) y su contexto de ejecución independiente — por eso necesitan <strong>context switching</strong>.</p>
<span class="warn">Que dos threads <em>lean</em> al mismo tiempo no es problema. El problema aparece apenas uno <strong>escribe</strong> mientras otro lee: ahí compartir el heap exige <strong>sincronización explícita</strong>.</span>`,
      },
      {
        title: 'Preemptivo vs colaborativo',
        html: `
<p>Dos modelos de cómo se le saca el control a una tarea:</p>
<ul>
<li><strong>Preemptivo</strong> (por interrupción): el <strong>sistema decide</strong> cuándo interrumpir una tarea; puede pausarla en cualquier momento, incluso si no terminó voluntariamente. Permite repartir la CPU equitativamente. <em>Ejemplo: los threads en Linux o Windows.</em></li>
<li><strong>Cooperativo</strong> (colaborativo): las tareas <strong>ceden voluntariamente</strong> el control; el sistema no puede interrumpir una tarea que no se lo permite. Requiere tareas "bien comportadas", que cedan con regularidad. <em>Ejemplo: async/await en Rust — un Future solo avanza (y solo cede) cuando se hace <code>await</code>.</em></li>
</ul>
<span class="warn">La contracara del modelo cooperativo: una tarea mal portada (un cómputo largo sin ningún <code>await</code>) <strong>congela a todas las demás</strong>. En el modelo preemptivo eso no puede pasar, porque el SO la interrumpe igual.</span>`,
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
<p>Patrón para <strong>paralelismo de datos</strong>: el cómputo (<em>task</em>) se parte en sub-cómputos menores (<em>subtasks</em>) que se resuelven en paralelo, y sus resultados se <strong>unen</strong> (join) para construir la solución del cómputo inicial. El grafo de ejecución es un árbol: ideal para divide &amp; conquer.</p>
<p><strong>Condiciones que debe cumplir el problema</strong> para poder aplicar este modelo:</p>
<ul>
<li>Que se pueda <strong>partir en subtareas</strong> (un thread por subtarea).</li>
<li>Que se puedan <strong>unir los resultados</strong> de cada subtarea para obtener el resultado total.</li>
<li>Que se pueda desarrollar <strong>recursivamente</strong>.</li>
<li>Que cada subtarea sea <strong>independiente / aislada</strong>: tiene todos los datos que necesita antes de iniciar, no precisa datos nuevos ni de otras tareas ni de nadie.</li>
</ul>
<p><strong>La gran ventaja</strong>: no requiere sincronización y es <strong>determinístico</strong>. No hay race conditions porque las tareas no compiten por recursos; los threads están aislados y el programa produce el mismo resultado independientemente de la velocidad de cada uno.</p>
<p>Ejemplos de la materia: <code>mergesort.rs</code> (cada mitad se ordena en un hilo y el merge es el join) y <code>wordcountpar.rs</code> (cada hilo cuenta un pedazo del archivo y al final se suman los HashMap).</p>
<p>Performance ideal: <span class="formula">t(secuencial) / N(threads)</span>. Puede desviarse si hay una tarea grande y otra chica, más el costo del procesamiento de combinación.</p>`,
      },
      {
        title: 'Work stealing',
        html: `
<p>Algoritmo de <strong>scheduling</strong> de tareas entre threads. Los threads libres/inactivos (los que terminaron sus subtareas) intentan <strong>robarle</strong> tareas a los ocupados para balancear la carga.</p>
<ul>
<li>Cada thread tiene su propia <strong>cola de dos extremos (deque)</strong> con las tareas listas para ejecutar.</li>
<li>Cuando termina una tarea, coloca las subtareas que creó <strong>al final</strong> de su cola.</li>
<li>Cuando necesita trabajo, toma la siguiente <strong>del final</strong> de su propia cola.</li>
<li>Si su cola está vacía, roba una tarea <strong>del principio</strong> de la cola de otro thread (elegido al azar).</li>
</ul>
<p><strong>¿Por qué se roba del principio y no del final?</strong> Porque el thread dueño está sacando tareas del final: así <strong>no hay conflicto</strong>: uno saca por delante y el otro por atrás.</p>
<p><strong>¿Por qué un deque por thread y no una única cola compartida?</strong> Con una cola única, todos los threads competirían por el acceso: cada uno que quisiera agregar o tomar una tarea tendría que esperar su turno, aumentando el tiempo necesario y la <strong>necesidad de sincronización</strong> (habría que lockear la cola). Con un deque por thread, los workers <strong>solo se comunican cuando lo necesitan</strong> → menos sincronización, menos complejidad, mejor rendimiento.</p>`,
      },
      {
        title: 'Rayon y MapReduce',
        html: `
<p>Crear un hilo del SO por subtarea es caro y no escala (mergesort recursivo = miles de tareas). <strong>Rayon</strong> usa un <strong>pool de workers</strong> (≈ uno por core) con work stealing incorporado. Permite:</p>
<span class="rust">// 2 tareas en paralelo
let (v1, v2) = rayon::join(fn1, fn2);

// N tareas en paralelo
vec.par_iter().for_each(|value| { do_something(value); });

// map + reduce
let s = ['a','b','c','d','e'].par_iter()
    .map(|c| ...)
    .reduce(|| String::new(),
            |mut a: String, b: String| { a.push_str(&amp;b); a });</span>
<ul>
<li><code>par_iter()</code> crea un iterador paralelo: la biblioteca maneja los threads y distribuye el trabajo (una tarea por elemento del vector).</li>
<li><code>reduce()</code> y <code>reduce_with()</code> combinan los resultados.</li>
</ul>
<p><strong>MapReduce</strong> es el modelo de programación para procesar grandes volúmenes de datos con esta idea: divide el trabajo en dos partes — <strong>mapear</strong> los datos y luego <strong>reducirlos</strong> — y lo hace en paralelo usando muchas computadoras.</p>
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
        title: '¿Qué significa "correcto"?',
        html: `
<p>En programas secuenciales, si algo sale mal podés <strong>debuggear</strong>: el programa se comporta siempre igual para la misma entrada. En programas concurrentes el resultado <strong>depende del orden</strong> en que se ejecutan las tareas — y ese orden cambia entre corridas.</p>
<p>Por eso la definición:</p>
<p><em>La <strong>corrección de concurrencia</strong> asegura que el resultado de la ejecución concurrente sea el mismo que si las operaciones se hubieran ejecutado en <strong>algún orden secuencial válido</strong>, sin errores.</em></p>
<p>Las propiedades a demostrar se agrupan en dos familias:</p>
<ul>
<li><strong>Safety</strong> ("nunca pasa algo malo"): debe ser verdadera <strong>siempre</strong>, en todo momento de la ejecución. Ejemplos: <strong>exclusión mutua</strong> (dos procesos no ejecutan la sección crítica a la vez) y <strong>ausencia de deadlock</strong> (los procesos no quedan esperando entre sí indefinidamente).</li>
<li><strong>Liveness</strong> ("eventualmente pasa algo bueno"): garantiza que el sistema <strong>progresa</strong>, que no queda colgado ni congelado. Ejemplos: <strong>ausencia de starvation</strong> (si un proceso está listo para usar un recurso, en algún momento accede) y <strong>fairness</strong> (si una instrucción está siempre habilitada, en algún momento se ejecuta: ningún proceso queda excluido o postergado indefinidamente).</li>
</ul>
<span class="tip">Una regla práctica para distinguirlas: una propiedad de <em>safety</em> se puede violar en un <strong>instante concreto</strong> (podés señalar el momento exacto en que se rompió). Una de <em>liveness</em> solo se viola en una <strong>ejecución infinita</strong> (nunca podés decir "acá se rompió", solo "nunca pasó").</span>`,
      },
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
<p>El modelo mental: cada proceso concurrente ejecuta un <strong>loop infinito</strong> cuyo código se divide en <strong>parte crítica</strong> y <strong>parte no-crítica</strong>. La sección crítica debe <strong>progresar</strong> (si entrás, eventualmente terminás y salís); la parte NO crítica no requiere progreso ni exclusividad — el proceso puede terminar ahí, o quedarse en un loop infinito, sin afectar a los demás.</p>
<span class="tip">Deadlock viola <em>liveness</em> (nadie progresa) sin violar <em>safety</em> (nadie rompió la exclusión mutua). Un programa colgado es "seguro" — ese contraste es la distinción clásica entre las dos familias de propiedades.</span>`,
      },
      {
        title: 'Locks: el mecanismo',
        html: `
<p>Los <strong>locks</strong> son mecanismos de sincronización que <strong>aseguran exclusión mutua</strong>: permiten que solo un proceso acceda a una sección crítica a la vez. Para implementarlos hace falta soporte tanto del <strong>hardware</strong> como del <strong>sistema operativo</strong>.</p>
<p>Se implementan como variables de tipo lock, que contienen el estado del mismo, con dos métodos:</p>
<ul>
<li><strong><code>lock()</code></strong>: el proceso <strong>se bloquea</strong> hasta poder obtener el lock.</li>
<li><strong><code>unlock()</code></strong>: el proceso libera el lock que tomó previamente.</li>
</ul>
<p>Características y trampas:</p>
<ul>
<li>Los threads deben tomar el lock (o esperar a que se libere) y al terminar <strong>liberarlo</strong> para que otro pueda tomarlo.</li>
<li><strong>Si no se libera el lock, se entra en deadlock.</strong></li>
<li><strong>Lock de lectura</strong> (shared): puede haber múltiples accediendo mientras no haya escritura.</li>
<li><strong>Lock de escritura</strong> (exclusive): solo puede haber uno accediendo a la sección crítica.</li>
</ul>
<p>En UNIX se los conoce como <em>shared locks</em> y <em>exclusive locks</em>; en Rust son los dos modos de <code>RwLock</code>.</p>`,
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
</ul>
<span class="rust">fn read(&amp;self)  -&gt; LockResult&lt;RwLockReadGuard&lt;T&gt;&gt;   // bloquea hasta obtener acceso compartido
fn write(&amp;self) -&gt; LockResult&lt;RwLockWriteGuard&lt;T&gt;&gt;  // bloquea hasta obtener acceso exclusivo</span>
<p>Ambos devuelven una guarda que libera el lock por <strong>RAII</strong> al salir de scope. Rust exige que <code>T</code> sea <strong><code>Send</code></strong> para compartirlo entre threads, y <strong><code>Sync</code></strong> para permitir acceso concurrente entre lectores.</p>
<span class="warn"><strong>Locks envenenados</strong>: si un thread toma el lock de forma exclusiva (write) y mientras lo tiene ejecuta <code>panic!</code>, el lock queda <strong>envenenado</strong> — el dato pudo quedar a medio modificar. Todas las llamadas posteriores a <code>read()</code> y <code>write()</code> devuelven <code>Err</code>. Por eso el <code>.unwrap()</code> que ves en todos lados: está desenvolviendo ese Result.</span>`,
      },
      {
        title: 'Atómicos: sincronización sin locks',
        html: `
<p>Para datos chicos (contadores, flags) hay operaciones de hardware indivisibles: <code>AtomicUsize</code>, <code>AtomicBool</code>, etc. <code>fetch_add(1, Ordering::SeqCst)</code> hace el leer-sumar-escribir <strong>en una sola operación atómica</strong> — sin lock, sin bloqueo, sin lost update.</p>
<ul>
<li>Mucho más baratos que un Mutex, pero solo para operaciones simples sobre un valor.</li>
<li>El <code>Ordering</code> (Relaxed, Acquire/Release, SeqCst) controla qué reordenamientos de memoria se permiten. Regla práctica de la materia: <code>SeqCst</code> hasta que sepas exactamente por qué relajarlo.</li>
</ul>
<span class="tip">Jerarquía de decisión: ¿un contador? atomic. ¿una estructura? Mutex. ¿lecturas dominantes? RwLock. ¿evitás compartir directamente? canales/actores.</span>`,
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
        title: 'Semáforos: definición formal',
        html: `
<p>El <strong>semáforo</strong> (Dijkstra) es un mecanismo de sincronización de <strong>alto nivel</strong>: un tipo de dato compuesto por <strong>dos campos</strong>:</p>
<ul>
<li><strong>V</strong> = un <strong>contador</strong> representado por un entero <strong>no negativo</strong>, inicializado en un valor K ≥ 0.</li>
<li><strong>L</strong> = un <strong>set de procesos</strong> (los bloqueados), inicializado como el conjunto vacío ∅.</li>
</ul>
<p>Si contador &gt; 0 ⇒ hay recurso disponible; si contador ≤ 0 ⇒ recurso no disponible. Se definen <strong>dos operaciones atómicas</strong>:</p>
<div class="tablewrap"><table>
<tr><th>wait(S) — también p(S)</th><th>signal(S) — también v(S)</th></tr>
<tr><td><em>Intentar ocupar un recurso.</em><br>Si hay recursos (V &gt; 0), el proceso ejecuta y se actualiza S.V := S.V − 1. Si no, el proceso <strong>se bloquea</strong> y se agrega a la lista de espera L.</td><td><em>Liberar o devolver el recurso.</em><br>Si existen procesos bloqueados en L, <strong>despierta a uno</strong> (no se especifica cuál), lo pone en estado <em>ready</em> y ese continúa desde donde quedó. Si no hay nadie esperando, libera recurso: S.V := S.V + 1.</td></tr>
<tr><td><span class="rust">if S.V &gt; 0
   S.V := S.V - 1
else
   S.L add p
   p.state := blocked</span></td><td><span class="rust">if S.L is empty
   S.V := S.V + 1
else
   sea q un elemento
     arbitrario de S.L
   S.L remove q
   q.state := ready</span></td></tr>
</table></div>
<p><strong>Ambas operaciones son atómicas</strong>: si dos procesos quieren ejecutarlas, una va a tener que esperar. Eso lo asegura el sistema operativo — acá no hay condición de carrera.</p>
<p><strong>Invariantes</strong> (condiciones que deben cumplirse <em>siempre</em>; sirven para probar que nunca se llega a un estado inválido):</p>
<ul>
<li><span class="formula">S.V ≥ 0</span> — nunca puede haber un número negativo de recursos.</li>
<li><span class="formula">S.V = k + #signal(S) − #wait(S)</span> — el número actual de recursos es igual a la cantidad inicial (k), más las señales realizadas, menos los bloqueos.</li>
</ul>
<ul>
<li>Con valor inicial 1 es un <strong>semáforo binario</strong> (≈ mutex, pero sin dueño: cualquiera puede hacer signal — más flexible y más peligroso).</li>
<li>Con valor inicial N limita a N usuarios simultáneos de un recurso (pool de conexiones, estacionamiento).</li>
</ul>
<p>En Rust se usa el crate <strong><code>std-semaphore</code></strong>: <code>Semaphore::new(5)</code>, <code>sem.acquire()</code> (wait), <code>sem.release()</code> (signal), y <code>sem.access()</code> que devuelve una guarda con patrón <strong>RAII</strong> — se libera sola al salir del scope.</p>`,
      },
      {
        title: 'Productor-consumidor con buffer',
        widget: 'sem-detail',
        html: `
<p>Se definen dos familias de procesos: <strong>Productores</strong> y <strong>Consumidores</strong>. Los requisitos a cumplir:</p>
<ol>
<li>No se puede consumir lo que no hay.</li>
<li>Todos los ítems producidos son eventualmente consumidos.</li>
<li>Al espacio de almacenamiento se accede de a uno.</li>
<li>Se debe respetar el orden de almacenamiento y retiro de los ítems (<strong>FIFO</strong>).</li>
</ol>
<p>Al usar un buffer de comunicación aparecen <strong>dos problemas de sincronización</strong>:</p>
<ol>
<li><strong>No se puede consumir si el buffer está vacío</strong> → sincronizamos al consumidor con que el buffer no esté vacío.</li>
<li><strong>No se puede producir si el buffer está lleno</strong> → frenamos al productor para que no siga produciendo.</li>
</ol>
<p><strong>Buffer infinito</strong> — solo se presenta el problema 1 (es teórico: ninguna computadora tiene memoria infinita). Alcanza con un semáforo <code>notEmpty</code> inicializado en 0:</p>
<div class="tablewrap"><table>
<tr><th>Productor</th><th>Consumidor</th></tr>
<tr><td><span class="rust">loop forever
  p1: append(d, buffer)
  p2: signal(notEmpty)</span></td><td><span class="rust">loop forever
  q1: wait(notEmpty)
  q2: d &lt;- take(buffer)</span></td></tr>
</table></div>
<p><strong>Buffer acotado</strong> — se presentan ambos problemas. Se agrega <code>notFull</code> inicializado en <strong>N</strong> (cuando arranca, todo el buffer está disponible):</p>
<div class="tablewrap"><table>
<tr><th>Productor</th><th>Consumidor</th></tr>
<tr><td><span class="rust">loop forever
  p1: producir
  p2: wait(notFull)
  p3: append(d, buffer)
  p4: signal(notEmpty)</span></td><td><span class="rust">loop forever
  q1: wait(notEmpty)
  q2: d &lt;- take(buffer)
  q3: signal(notFull)
  q4: consume(d)</span></td></tr>
</table></div>
<p>El semáforo cuenta <strong>cuánto espacio disponible tengo</strong> para colocar elementos; <code>notEmpty</code> cuenta los elementos disponibles para consumir. <strong>No es necesario que productor y consumidor sean el mismo hilo.</strong></p>
<span class="warn">El ORDEN importa: semáforo PRIMERO, mutex DESPUÉS. Si tomás el mutex y recién ahí esperás el semáforo, te dormís CON el lock en la mano y el otro lado nunca puede avanzar → deadlock. Probalo en la simulación con el toggle.</span>`,
      },
      {
        title: 'Locks vs semáforos',
        html: `
<div class="tablewrap"><table>
<tr><th>Lock</th><th>Semáforo binario (mutex)</th></tr>
<tr><td>Solo el thread que tiene el lock puede liberarlo</td><td><strong>Cualquier</strong> thread libera recursos y despierta a un bloqueado</td></tr>
<tr><td>Los threads utilizan los métodos lock y unlock para tomar y liberar el recurso: deben hacerlo ellos únicamente</td><td>El wait y el signal los pueden realizar <strong>dos procesos distintos</strong>: es una herramienta más flexible</td></tr>
<tr><td>El thread interesado <strong>está preguntando</strong> si se liberó el lock</td><td>Se <strong>notifica</strong> al thread interesado que se liberó el recurso, despertándolo</td></tr>
</table></div>
<span class="tip">Esa flexibilidad del semáforo es justamente lo que lo hace peligroso: como cualquiera puede hacer signal, es fácil desbalancear los wait/signal y romper el invariante sin que el compilador diga nada.</span>`,
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
<p>Una condition variable <strong>no guarda ningún valor</strong>, tiene asociada una <strong>cola FIFO</strong> y consta de tres operaciones atómicas: <code>waitC(cond)</code>, <code>signalC(cond)</code> y <code>emptyC(cond)</code>. Su nombre representa la condición que se quiere: <code>waitC(not True)</code> se lee "wait for not true to be true".</p>
<p>Mutex + condvars + la disciplina de "toda la espera y el aviso pasan por el lock" = un <strong>monitor</strong>.</p>`,
      },
      {
        title: 'Monitores',
        html: `
<p>Son mecanismos de sincronización que <strong>combinan exclusión mutua con condiciones de espera/notificación</strong> (wait/notify). Son como semáforos <em>sin</em> busy-wait, que usan condition variables para notificar recursos: una estructura que combina exclusión mutua y sincronización de condiciones <strong>en uno</strong>.</p>
<p>Un monitor:</p>
<ul>
<li>Permite <strong>exclusión mutua</strong> entre hilos: si se llaman múltiples operaciones de un monitor, la implementación asegura que se corren en exclusión mutua.</li>
<li>Permite que un hilo <strong>espere (block)</strong> hasta que una condición sea verdadera.</li>
<li>Tiene un mecanismo para <strong>señalar</strong> a otros hilos cuando su condición se cumple.</li>
</ul>
<p>Todo este manejo se hace de manera <strong>interna</strong>, para evitar errores comunes (como olvidarse de hacer signal en un semáforo). Sus componentes:</p>
<ul>
<li>Un nombre identificador.</li>
<li><strong>Variables internas</strong>, accesibles solo dentro del monitor (protegen el estado compartido).</li>
<li><strong>Procedimientos</strong> que acceden a las variables internas (los métodos del monitor).</li>
<li>Una <strong>interfaz pública</strong> para los procesos externos.</li>
<li><strong>Variables de condición</strong> para sincronización interna: permiten que un hilo se duerma esperando a que se cumpla algo; <strong>se usan junto a un mutex</strong>.</li>
<li>Una rutina de <strong>inicialización</strong> de las variables internas.</li>
</ul>
<p>Los procesos que interactúan con un monitor pueden estar en estos estados: <em>esperando entrar</em> (si otro hilo lo está usando), <em>ejecutando dentro</em>, <em>bloqueado en una variable de condición</em> (FIFO), <em>recién liberado de una condición</em> (waitC), o <em>recién completada una operación</em> (signalC).</p>
<p><strong>Diferencias entre monitores y semáforos:</strong></p>
<div class="tablewrap"><table>
<tr><th>Semáforo</th><th>Monitor</th></tr>
<tr><td><code>wait</code> puede bloquear o no</td><td><code>waitC</code> <strong>siempre</strong> bloquea</td></tr>
<tr><td><code>signal</code> siempre tiene efecto</td><td><code>signalC</code> <strong>no tiene efecto</strong> si la cola está vacía</td></tr>
<tr><td><code>signal</code> desbloquea un proceso <strong>arbitrario</strong></td><td><code>signalC</code> desbloquea el proceso <strong>del tope de la cola</strong> (FIFO)</td></tr>
<tr><td>Un proceso desbloqueado con signal puede continuar su ejecución inmediatamente</td><td>Un proceso desbloqueado con signalC debe esperar a que el proceso señalizador deje el monitor</td></tr>
</table></div>
<span class="tip">La gran ventaja: si en un semáforo te <strong>olvidás de hacer signal(S)</strong>, podés entrar en deadlock. Con monitores eso no ocurre, porque el objeto mismo se encarga de sincronizar — vos no te encargás.</span>`,
      },
      {
        title: 'Barreras: todos esperan a todos',
        html: `
<p><code>Barrier::new(n)</code>: permiten sincronizar varios threads en <strong>puntos determinados</strong> de un cálculo o algoritmo. Se usan para que se esperen entre sí hasta que todos alcancen cierto punto. En Rust son <strong>reutilizables</strong> automáticamente tras cada sincronización.</p>
<span class="rust">let barrier = Barrier::new(n);       // n = threads a sincronizar
let wait_result = barrier.wait();    // bloquea hasta que lleguen todos
if wait_result.is_leader() {
    // este thread es el "líder" del grupo
}</span>
<p>El método <code>wait()</code> devuelve un <code>BarrierWaitResult</code> cuyo <code>is_leader()</code> devuelve <strong>true para un solo hilo</strong>: el <strong>último que llegó</strong> a la barrera. Los demás reciben false. Sirve para hacer un trabajo único entre fases (por ejemplo, consolidar resultados).</p>
<p>Uso típico: algoritmos por <strong>fases/iteraciones</strong> — simulaciones por pasos, algoritmos paralelos por fases (multiplicación de matrices por bloques), motores de videojuegos donde las tareas (renderizado, física, IA) se sincronizan por frame. Es el "join" de fork-join pero <strong>reutilizable</strong> sin matar los hilos.</p>`,
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
        title: 'Los otros clásicos: barbero, fumadores y banquero',
        html: `
<p><strong>Barbero dormilón — con 3 semáforos independientes.</strong> Un barbero atiende de a uno; sala de espera con K sillas. La solución modela una <strong>cola de espera y un punto de encuentro</strong>:</p>
<ol>
<li><strong>Semáforo de cliente esperando</strong> a ser atendido: el barbero "espera al recurso"; el cliente lo "libera" (= hay un cliente disponible para ser atendido).</li>
<li><strong>Semáforo del barbero</strong> para avisar que está listo para atender o que está ocupado: el cliente espera al barbero; el barbero libera el recurso cuando está listo para atender a un cliente.</li>
<li><strong>Semáforo del barbero</strong> para avisarle al cliente que terminó de cortarle el pelo: el cliente espera mientras que le corta el pelo; el barbero libera el recurso cuando terminó el corte.</li>
</ol>
<p><strong>Fumadores — resuelto con monitores.</strong> Un agente pone 2 de 3 ingredientes en la mesa; debe fumar el que tiene el tercero. El problema: si cada elemento de la mesa fuera un semáforo, cuando el agente los pone en la mesa se mandan la señal de que están habilitados y, según el orden de ejecución, <strong>podemos llegar a un deadlock</strong> (si el fumador de papel agarra el tabaco y otro se le adelanta con los fósforos).</p>
<p>La solución es poner un <strong>"adaptador"/agente en el medio</strong>: 1 agente, 3 fumadores y <strong>1 monitor "mesa"</strong> que protege el acceso y contiene una condvar por fumador. Cada fumador espera en su condvar hasta que estén todas las cosas que necesita; si no están todas, vuelve a dormir <strong>soltando el lock</strong>. El agente pone elementos y despierta a todos (<code>notify_all</code>).</p>
<p><strong>El problema del banquero.</strong> Un viejo banquero invierte su plata mediante amigos en diversos fondos de inversión: al inicio de cada semana les envía dinero, y espera al final de la semana el resultado de esas inversiones. Las inversiones pueden dar entre −50% y +50%.</p>
<ul>
<li><strong>Modelado con fork-join</strong>: dividir las semanas, repartir el saldo y lanzar un thread por inversor <em>en cada semana</em>. Funciona, pero es costoso: se están levantando y matando threads todo el tiempo cuando siempre hacen lo mismo. Además los inversores son <em>stateless</em>: deberían estar "vivos" de verdad.</li>
<li><strong>Con estado mutable compartido</strong>: una cuenta por inversor con <code>Arc&lt;Mutex&gt;</code>. Cada inversor bloquea cuando quiere, mete la plata y después se destraba: no necesitan esperar a que arranque la semana. <span class="warn">Sin herramienta de sincronización este problema NO se puede resolver: se podría intentar con <strong>busy wait</strong> (un <code>while</code> hasta que tenga saldo), pero eso está mal — desperdicia CPU sin hacer avances reales.</span></li>
<li><strong>Con barreras</strong> — hacen falta <strong>dos</strong>: (1) saber cuándo están todos listos para iniciar la semana (recién ahí se puede repartir la plata e invertir), y (2) saber cuándo ya está calculado cuánto lleva cada uno (nadie puede poner/llevarse más plata hasta saber cuánto tiene cada uno).</li>
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
<span class="warn">"Lo probé mil veces y nunca se colgó" vs "el grafo de alcance no tiene marcados muertos": lo primero es evidencia anecdótica, lo segundo es una DEMOSTRACIÓN. Ese contraste es exactamente el valor de modelar con redes de Petri.</span>`,
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
<span class="warn">El arco inhibidor no es un detalle: le da a las redes de Petri poder de Turing y hace la verificación general indecidible. ¿Por qué lector-escritor no sale con una red ordinaria? Porque no se puede testear vacío.</span>`,
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
        title: 'Cómo se clasifica la comunicación',
        html: `
<p>Los canales son la herramienta para comunicar threads o tareas que conviven dentro de un mismo proceso. Los modelos de comunicación se clasifican por tres ejes:</p>
<p><strong>1 · Tipo de comunicación</strong></p>
<ul>
<li><strong>Sincrónica</strong>: el emisor <strong>espera</strong> a que el receptor reciba el mensaje (bloqueante). Ej: <code>send()</code> y <code>recv()</code> sincronizados.</li>
<li><strong>Asincrónica</strong> (con buffer): el emisor <strong>no espera</strong>; el mensaje se almacena en un buffer intermedio.</li>
</ul>
<p><strong>2 · Direccionamiento</strong> — ¿cómo se decide a quién se envía el mensaje?</p>
<ul>
<li><strong>Simétrico</strong>: ambos procesos se conocen explícitamente.</li>
<li><strong>Asimétrico</strong>: solo el emisor o el receptor conoce al otro.</li>
<li><strong>Sin direccionamiento</strong>: los mensajes se matchean <strong>por contenido</strong> (como en Linda o tuplespaces).</li>
</ul>
<p><strong>3 · Flujo de datos</strong></p>
<ul>
<li><strong>Unidireccional</strong>: un solo sentido (emisor → receptor).</li>
<li><strong>Bidireccional</strong>: ida y vuelta (como un socket full-duplex).</li>
</ul>
<p>Un <strong>canal</strong> conecta procesos (o hilos), tiene un nombre y es <strong>tipado</strong> (ej: canal de int). Puede ser sincrónico (sin buffer) o asincrónico (con buffer interno), y usualmente es unidireccional.</p>
<p><strong>Selective input</strong>: permite escuchar múltiples canales y reaccionar ante el primero que reciba algo — el <code>select</code> de toda la vida:</p>
<span class="rust">either
   ch1 =&gt; var1
or
   ch2 =&gt; var2
or
   ch3 =&gt; var3</span>`,
      },
      {
        title: 'Canales mpsc en Rust',
        widget: 'mpsc-detail',
        html: `
<p>Alternativa al estado compartido: los hilos se pasan <strong>mensajes</strong> por un canal. En Rust, <code>std::sync::mpsc</code>: <strong>multiple producer, single consumer</strong>. El <code>Sender</code> (<strong>tx</strong>) se clona para N productores; el <code>Receiver</code> (<strong>rx</strong>) es único.</p>
<span class="rust">let (tx, rx) = mpsc::channel();
thread::spawn(move || {
    let val = String::from("Hola");
    tx.send(val).unwrap();
});
let received = rx.recv().unwrap();</span>
<ul>
<li>Son <strong>unidireccionales</strong>: el extremo de lectura va a un hilo y el de escritura a otro.</li>
<li>Son <strong>tipados</strong> (transmiten valores de un tipo específico).</li>
<li>Seguros para múltiples productores pero <strong>un solo receptor</strong>: se puede clonar el extremo de transmisión (<code>tx</code>), pero <strong>no</strong> el de recepción.</li>
<li>El mensaje <strong>transfiere ownership</strong>: después del <code>send(dato)</code>, el productor ya no puede tocarlo — evita problemas de acceso a la misma región de memoria. El borrow checker convierte "no compartas memoria" en regla compilada.</li>
<li><code>recv()</code> bloquea hasta que haya mensaje; devuelve <code>Err</code> cuando <strong>todos</strong> los senders se droppearon (así se detecta el fin — cerrar el canal es el "join" natural).</li>
<li>Variante acotada: <code>sync_channel(N)</code> — si el buffer está lleno, <code>send()</code> bloquea: <strong>backpressure</strong> gratis.</li>
</ul>
<span class="tip">Los <strong>filósofos con canales</strong>: se define un canal de booleanos de 5 elementos (los tenedores). El filósofo saca del canal i e i+1 (espera por los 2 tenedores) y al terminar los devuelve enviando <code>true</code>. No importa el valor: se usa como dato "dummy" — lo que sincroniza es el <em>acto</em> de enviar y recibir.</span>`,
      },
      {
        title: 'Remote Procedure Calls (RPC)',
        html: `
<p>Permiten al cliente <strong>ejecutar funciones en un servidor</strong> ubicado en otro procesador. La idea: cuando un proceso quiere llamar una función que no está en su máquina sino en otra, no puede simplemente hacer <code>miFuncion()</code> — hace falta un <strong>representante local</strong> de esa función remota.</p>
<ul>
<li>Se requiere la implementación de <strong>stubs</strong> en ambos extremos: un stub es un pedacito de código intermediario que actúa como <strong>puente</strong> entre el cliente y el servidor.</li>
<li>Los stubs conforman las <strong>interfaces remotas</strong> utilizadas para compilar cliente y servidor.</li>
<li>Requiere <strong>localización de servicios</strong> y <strong>envío de parámetros</strong> al servidor (<em>parameter marshalling</em>: serializar los argumentos para mandarlos por la red).</li>
</ul>`,
      },
      {
        title: 'Modelo de actores',
        widget: 'actors-detail',
        html: `
<p>Modelo basado en el <strong>pasaje de mensajes</strong>. El actor es la entidad principal: son <strong>livianos</strong> (se pueden crear miles, en lugar de threads), encapsulan comportamiento y estado, y un actor supervisor puede crear actores hijo.</p>
<p>Está compuesto por:</p>
<ul>
<li><strong>Dirección</strong>: adonde enviarle mensajes. Es su "nombre" o ID.</li>
<li><strong>Casilla de correo (mailbox)</strong>: una <strong>FIFO</strong> de los últimos mensajes recibidos.</li>
</ul>
<p>Se encolan los mensajes que se reciben; cada actor procesa su mailbox <strong>de forma secuencial</strong>. De esta manera <strong>evitan las secciones críticas</strong>: hay memoria local para cada actor que se va a mutar a partir del procesamiento secuencial de cada mensaje.</p>
<ul>
<li>Su estado interno es un <strong>mutex implícito</strong>: como solo pueden procesar un mensaje por vez, mientras maneja ese mensaje no puede procesar otro al mismo tiempo → no voy a poder tener dos cosas intentando mutar el estado interno al mismo tiempo.</li>
<li>Los mensajes son estructuras simples <strong>inmutables</strong>: no hay condiciones de carrera entre los datos, no hay que poner locks entre los datos; una vez que el emisor tiene el mensaje que le va a enviar, el receptor no lo puede modificar.</li>
<li>Los actores creados por otro son <strong>actores hijos</strong>, y el actual es su <strong>supervisor</strong>. <strong>No comparten memoria</strong> con otros actores.</li>
</ul>
<span class="tip">¿Por qué los actores no necesitan Mutex? Porque el estado es privado y el mailbox serializa el acceso: procesar de a un mensaje ES la exclusión mutua. El precio: todo pasa a ser asincrónico y hay que diseñar los mensajes.</span>`,
      },
      {
        title: 'Actores en Rust: Actix',
        html: `
<p><strong>Actix</strong> usa <strong>Tokio</strong> (runtime asincrónico) y futures. Tiene un <strong>Arbiter</strong>: corre un <em>event loop</em> interno, aloja uno o más actores (son livianos) y administra tareas asincrónicas como futures, timers y el envío de mensajes entre actores. Cada actor se ejecuta en un contexto de ejecución <code>Context&lt;A&gt;</code> que gestiona su casilla de mensajes, ejecuta su lógica y puede detenerse o reiniciarse.</p>
<p><strong>Para crear un actor:</strong></p>
<ol>
<li>Crear una estructura (struct) para representar al actor.</li>
<li>Implementar el trait <code>Actor</code> para esa estructura.</li>
<li>Definir un tipo de mensaje (implementando el trait <code>Message</code>).</li>
<li>Implementar un handler para ese mensaje usando el trait <code>Handler&lt;M&gt;</code>.</li>
<li>Spawnear el actor con <code>.start()</code>, que lo ejecuta dentro de un Arbiter.</li>
</ol>
<p><strong>Ciclo de vida de un actor:</strong></p>
<div class="tablewrap"><table>
<tr><th>Estado</th><th>Descripción</th></tr>
<tr><td>Started</td><td>El actor se acaba de inicializar. Podés sobreescribir <code>started(&amp;mut self, ctx)</code> si querés ejecutar algo apenas arranca. A partir de acá el contexto está disponible.</td></tr>
<tr><td>Running</td><td>Estado normal: está vivo, recibiendo y procesando mensajes. Puede estar en este estado de forma indefinida.</td></tr>
<tr><td>Stopping</td><td>Se llamó a <code>ctx.stop()</code>, o ningún otro actor lo referencia, o su contexto quedó vacío.</td></tr>
<tr><td>Stopped</td><td>Desde el estado anterior no modificó su situación. Fin del ciclo: no procesa más mensajes.</td></tr>
</table></div>
<p><strong>Formas de enviar un mensaje</strong> (todas se ejecutan sobre la dirección del actor):</p>
<div class="tablewrap"><table>
<tr><th>Método</th><th>Descripción</th></tr>
<tr><td><code>addr.do_send(msg)</code></td><td>Envío <strong>"fire-and-forget"</strong>: no espera respuesta ni devuelve Result. Si el actor está caído o la casilla cerrada, el mensaje se descarta. Ignora errores en el envío.</td></tr>
<tr><td><code>addr.try_send(msg)</code></td><td>Envío <strong>sincrónico inmediato</strong>: falla si la casilla está llena o cerrada. Retorna <code>Result&lt;(), SendError&gt;</code>.</td></tr>
<tr><td><code>addr.send(msg)</code></td><td>Envío <strong>asincrónico y seguro</strong>: devuelve un Future que podés <code>await</code> para obtener la respuesta del actor.</td></tr>
</table></div>
<span class="warn">Los handlers de los actores se ejecutan como operaciones asincrónicas → hay que tener en cuenta que las operaciones no tengan alta demanda de procesamiento: si algo bloquea, <strong>rompe el executor</strong> y con él a todos los actores que aloja ese Arbiter.</span>`,
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
<div class="tablewrap"><table>
<tr><th>Característica</th><th>Async/await</th><th>Threads tradicionales</th></tr>
<tr><td>Uso de memoria</td><td>Mucho menor: <strong>~1 KB por tarea</strong></td><td>Mayor: típicamente <strong>~20–100 KB</strong> por thread</td></tr>
<tr><td>Tiempo de creación</td><td>Muy rápido (<strong>~300 ns</strong>)</td><td>Más lento (<strong>~15 µs</strong> o más)</td></tr>
<tr><td>Cambio de contexto</td><td>Muy eficiente: no involucra al sistema operativo</td><td>Costoso: cambio de stack, registros, etc.</td></tr>
<tr><td>Escalabilidad</td><td>Excelente: puede manejar <strong>miles/millones</strong> de tareas</td><td>Limitada: decenas/miles de threads</td></tr>
<tr><td>Bloqueo de recursos</td><td>Evita bloqueos si se usa correctamente</td><td>Bloqueo común (mutex, semáforos, etc.)</td></tr>
<tr><td>Consumo de CPU inactivo</td><td>Muy bajo (espera sin bloquear)</td><td>Puede desperdiciar CPU si hay threads bloqueados</td></tr>
</table></div>
<span class="tip">Para I/O masivo, async gana por varios órdenes de magnitud. Para cómputo intensivo (CPU-bound), los threads siguen siendo la herramienta: async no te da más cores.</span>`,
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
<span class="tip">Alcanza con entender el "por qué": los futures se auto-referencian, moverlos rompería esos punteros, y Pin es la garantía a nivel de tipos de que no se muevan. No hace falta pelear con la API de Pin — hace falta explicar el problema que resuelve.</span>`,
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
<p>Los <strong>desafíos concretos</strong> de pasar de channels (comunicación centralizada) a sockets (distribuida):</p>
<ul>
<li>Espacios de memoria separados.</li>
<li><strong>Serialización</strong> y necesidad de delimitar un protocolo.</li>
<li>Conexiones y desconexiones.</li>
<li><strong>Pérdida y/o reordenamiento</strong> de paquetes.</li>
<li>Relojes no sincronizados.</li>
<li>Entidades <em>unresponsive</em>: identificar que alguien se conectó, tiempo de viaje de un mensaje, y no asegurar que los datos lleguen a destino.</li>
</ul>
<span class="tip">El salto conceptual: en memoria compartida, la sincronización la da el hardware (instrucciones atómicas). En distribuido TODO se construye con mensajes que pueden perderse y demorarse — y un nodo lento es indistinguible de uno muerto (por eso los timeouts son la herramienta universal de detección de fallas… imperfecta).</span>`,
      },
      {
        title: 'Sockets: el modelo cliente-servidor',
        html: `
<p>Los <strong>sockets</strong> permiten la comunicación entre dos procesos diferentes, ya sea en la misma máquina o en dos distintas. En el modelo cliente-servidor:</p>
<ul>
<li><strong>Cliente</strong>: es <strong>activo</strong>, porque inicia la interacción con el servidor.</li>
<li><strong>Servidor</strong>: es <strong>pasivo</strong>, porque espera recibir las peticiones de los clientes. Es <em>pre-existente</em>: debe estar funcionando antes de que alguien quiera conectarse.</li>
</ul>
<p><strong>Arquitecturas</strong>: a <strong>dos niveles</strong> (el cliente interactúa directamente con el servidor) o a <strong>tres niveles</strong> con <em>middleware</em> (una capa de software entre cliente y servidor que provee seguridad y balanceo de carga). <strong>Tipos de servidor</strong>: <em>iterativo</em> (atiende las peticiones de a una) o <em>concurrente</em> (atiende varias a la vez).</p>
<p><strong>Tipos de servicio:</strong></p>
<ul>
<li><strong>Sin conexión</strong>: los datos se envían al receptor, sin control de flujo ni de errores.</li>
<li><strong>Sin conexión con ACK</strong>: por cada dato recibido, el receptor envía un acuse de recibo.</li>
<li><strong>Con conexión (tres fases)</strong>: establecimiento de la conexión, intercambio de datos y cierre. Hay control de flujo y de errores; se reservan recursos para entablar y llevar a cabo la comunicación.</li>
</ul>
<p><strong>Sockets en UNIX</strong>: <code>STREAM</code> → TCP (entrega garantizada del flujo de bytes); <code>DATAGRAM</code> → UDP (entrega no garantizada, sin conexión); <code>RAW</code> → permite enviar paquetes IP; <code>SEQUENCED PACKET</code> → como stream pero preservando delimitadores de registro (SPP).</p>
<p><strong>Secuencia del servidor</strong>: <code>socket()</code> reserva recursos → <code>bind()</code> le asigna una dirección local (imprescindible: el cliente necesita saber a dónde conectarse) → <code>listen()</code> lo convierte en <strong>socket pasivo</strong> (empieza a escuchar y encola las conexiones entrantes) → <code>accept()</code> extrae de la cola una conexión ya establecida y devuelve un file descriptor para comunicarse con ese cliente. <strong><code>accept()</code> es bloqueante</strong>: si no hay ninguna conexión, el programa queda a la espera.</p>
<p><strong>Secuencia del cliente</strong>: <code>socket()</code> → <code>connect()</code>, que lanza la conexión TCP hacia el servidor (el handshake) — también <strong>bloqueante</strong>. Después ambos usan <code>read()</code>/<code>write()</code> (o <code>send()</code>/<code>recv()</code> en stream, <code>sendto()</code>/<code>recvfrom()</code> en datagram) y cierran con <code>close()</code>.</p>
<span class="rust">// Rust: crear el socket y hacer el bind es un solo paso
let listener = TcpListener::bind(addr)?;
for stream in listener.incoming() {
    let stream = stream.unwrap();   // cada stream = una conexión abierta
}
// cliente
let socket = TcpStream::connect("localhost:8080")?;</span>
<span class="warn">El <strong>cierre de conexión en TCP es unilateral</strong>: cualquiera de los dos extremos puede enviar un mensaje de cierre, y cada parte decide cerrar la conexión de su lado. Por eso se hace close → se recibe close ACK ← se envía close ← y se envía un último ACK →. En Rust, la conexión se cierra cuando el <code>TcpStream</code> se dropea (<code>shutdown()</code> permite cerrar solo escritura, solo lectura, o ambas).</span>`,
      },
      {
        title: 'Exclusión mutua distribuida',
        widget: 'distmutex-detail',
        html: `
<p>El mismo problema de la sección crítica, sin memoria compartida. Los tres enfoques clásicos:</p>
<ul>
<li><strong>Centralizado</strong> (<code>centralizedmutex.rs</code>): un coordinador con una cola. REQUEST → GRANT → RELEASE: solo <strong>3 mensajes por acceso</strong>, orden justo. Contras: cuello de botella y <strong>single point of failure</strong>.</li>
<li><strong>Token ring</strong> (<code>tokenring.rs</code>): un único <strong>token</strong> circula por el anillo; solo su portador entra a la CS. No hay coordinador ni starvation (el token pasa por todos). Contras: mensajes constantes aunque nadie quiera entrar, y si el portador muere hay que <strong>detectar y regenerar el token</strong> (garantizando que no queden dos).</li>
<li><strong>Distribuido (Ricart-Agrawala)</strong>: no requiere líder. Cuando un proceso quiere entrar, <strong>broadcastea</strong> un mensaje con el nombre de la sección crítica, su número de proceso y un <strong>timestamp</strong>. Al recibirlo: <em>(1)</em> si el receptor no está en la CS y no quiere entrar, envía OK; <em>(2)</em> si está en la CS, no responde y <strong>encola</strong> el pedido; <em>(3)</em> si también quiere entrar, compara timestamps y <strong>gana el menor</strong> (el que decidió antes). Al salir de la CS, envía OK a todos los que encoló.</li>
</ul>
<p><strong>Comparación</strong> (el resumen de la cátedra):</p>
<div class="tablewrap"><table>
<tr><th>Algoritmo</th><th>Mensajes por entrada/salida</th><th>Demora antes de entrar</th><th>Problemas</th></tr>
<tr><td>Centralizado</td><td>3</td><td>2</td><td>Caída del coordinador</td></tr>
<tr><td>Distribuido</td><td>2(n − 1)</td><td>2(n − 1)</td><td>Caída de <strong>cualquier</strong> proceso</td></tr>
<tr><td>Token ring</td><td>1 a ∞</td><td>0 a n − 1</td><td>Token perdido, caída de un proceso</td></tr>
</table></div>
<p><strong>El algoritmo centralizado es el más simple y el más eficiente.</strong> El distribuido reemplaza el single point of failure por <em>n</em> points of failure: si algún proceso cae, su silencio se interpreta incorrectamente como una <strong>denegación de permiso</strong>, bloqueando todos los intentos posteriores de entrar a la sección crítica.</p>
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
        title: 'Transacciones: propiedades ACID',
        html: `
<p>Una <strong>transacción</strong> es un conjunto de operaciones que se ejecutan como una unidad. Sus <strong>primitivas</strong>:</p>
<ul>
<li><strong>BEGIN TRANSACTION</strong>: marca el inicio.</li>
<li><strong>END TRANSACTION</strong>: finaliza y trata de hacer commit (se "trata" porque pueden haber cambiado las condiciones y no poder efectivizarse).</li>
<li><strong>ABORT TRANSACTION</strong>: finaliza forzadamente y <strong>restaura los valores anteriores</strong>.</li>
<li><strong>READ / WRITE</strong>: leer y escribir datos de un archivo u otro objeto.</li>
</ul>
<p><strong>Precondiciones</strong> para que se puedan ejecutar con éxito: existencia de recursos (los datos que quiere leer/modificar), bloqueo de recursos (adquisición de locks), condiciones de estado (el estado garantiza coherencia y consistencia antes de ejecutarse) y validación de reglas de negocio.</p>
<p><strong>Las propiedades ACID:</strong></p>
<ul>
<li><strong>Atómicas</strong> (Atomicity): la transacción <strong>no puede ser dividida</strong>. Confirmamos la finalización de una transacción <em>completa</em>, no por pedacitos.</li>
<li><strong>Consistentes</strong> (Consistency): cumple con todos los <strong>invariantes</strong> del sistema (respeta las restricciones). Ejemplo bancario: una transferencia entre cuentas <strong>lleva la transacción de un estado válido a otro</strong> — la suma total del dinero no cambia.</li>
<li><strong>Aisladas o serializadas</strong> (Isolation): las transacciones concurrentes <strong>no interfieren entre ellas</strong>. En un sistema concurrente, el resultado es como si las operaciones se hubieran ejecutado una después de la otra de forma serializada.</li>
<li><strong>Durables</strong> (Durability): una vez que se commitean los cambios, son <strong>permanentes</strong>. Se sustenta en la premisa de que el sistema almacena la información en discos.</li>
</ul>
<span class="warn">Excepción a la durabilidad: las <strong>transacciones anidadas</strong> no son durables. Puede ocurrir que la transacción padre no pueda ejecutar el commit, y eso hace que se deshagan todos los cambios de esa transacción y todos los de la transacción hija. Los cambios de la hija no fueron durables, porque fue contenida dentro de otra más grande.</span>
<p><strong>Requisitos del sistema</strong>: procesos independientes que pueden fallar aleatoriamente, errores de comunicación manejados transparentemente por la capa de comunicación, y servidores sustentados sobre <strong>storage estable</strong> (los datos permanecen una vez grabados; la probabilidad de perderlos es extremadamente pequeña).</p>`,
      },
      {
        title: 'Cómo se implementan las transacciones',
        html: `
<p><strong>1 · Private Workspace.</strong> Al iniciar una transacción, el proceso recibe una <strong>copia de todos los archivos</strong> a los que tiene acceso. Trabaja sobre la copia local, y al hacer commit se revisa si hay conflictos (si otro proceso realizó modificaciones); si no los hay, se persisten los cambios.</p>
<ul>
<li><strong>Ventaja</strong>: aislamiento, y menos overhead que el WAL porque no requiere el mismo nivel de registro detallado.</li>
<li><strong>Desventaja</strong>: extremadamente costoso salvo por optimizaciones. <em>Ejemplo: Google Docs.</em></li>
</ul>
<p><strong>2 · Writeahead Log (WAL).</strong> Se escribe un archivo de log <strong>de antemano</strong>. Los archivos se modifican <em>in place</em>, pero se mantiene una lista de los cambios aplicados: primero se escribe la lista y luego se modifica el archivo. Al commitear se escribe un registro de commit en el log; si la transacción se aborta, <strong>se lee el log de atrás hacia adelante para deshacer los cambios (rollback)</strong>.</p>
<ul>
<li><strong>Ventajas</strong>: es <strong>robusto</strong> frente a problemas eléctricos (si se venía modificando algo y ocurre un desperfecto, se vuelve a colocar en un estado válido llevándolo al inicio de la transacción cortada); garantiza <strong>durabilidad</strong>; facilita la <strong>recuperación</strong> frente a fallas.</li>
<li><strong>Desventaja</strong>: se debe escribir dos veces (en el log antes de aplicar los cambios). <em>Ejemplo: PostgreSQL.</em></li>
</ul>
<p><strong>3 · Commit de dos fases</strong> — el de la sección siguiente.</p>`,
      },
      {
        title: 'Control de concurrencia',
        html: `
<p>Controlar la concurrencia está relacionado con la sincronización y el <strong>ordenamiento</strong> de la ejecución de las transacciones, y con evitar deadlocks. Tres enfoques:</p>
<p><strong>1 · Two-Phase Locking (2PL)</strong></p>
<ol>
<li><strong>Fase de expansión</strong> (growing): se toman todos los locks a usar.</li>
<li><strong>Fase de contracción</strong> (shrinking): se liberan todos los locks — <strong>no se pueden tomar nuevos locks</strong>.</li>
</ol>
<ul>
<li><strong>Ventaja</strong>: garantiza la propiedad <em>serializable</em> para las transacciones.</li>
<li><strong>Desventaja</strong>: pueden ocurrir <strong>deadlocks</strong>: si tengo transacciones distintas que están pidiendo un conjunto de locks ya tengo una gran chance de tener deadlocks.</li>
<li><strong>Strict 2PL</strong>: variante donde la contracción ocurre <strong>después del commit</strong> de la transacción.</li>
</ul>
<p><strong>2 · Concurrencia optimista</strong> (el modelo de GitHub)</p>
<p>Los cambios se hacen <strong>sin lockeos</strong>, porque se asume que no va a haber conflictos. El proceso modifica los archivos sin ningún control, esperando que no haya conflictos; al commitear <strong>se verifica</strong> si el resto de las transacciones modificó los mismos archivos y, si es así, <strong>se aborta la transacción</strong>.</p>
<ul>
<li><strong>Ventaja</strong>: libre de deadlocks, por lo que favorece el paralelismo.</li>
<li><strong>Desventaja</strong>: rehacer todo puede ser costoso en condiciones de alta carga.</li>
</ul>
<p><strong>3 · Timestamps</strong></p>
<p>Existen timestamps únicos globales para garantizar orden (ver algoritmo de <strong>relojes de Lamport</strong>). Cada archivo tiene dos timestamps: lectura y escritura, indicando qué transacción hizo la última operación en cada caso. Cada transacción recibe un timestamp al iniciarse, y se compara con los del archivo:</p>
<ul>
<li>Si es <strong>mayor</strong>, la transacción está en orden y se procede con la operación.</li>
<li>Si es <strong>menor</strong>, la transacción <strong>se aborta</strong> (es más vieja que la última modificación del archivo).</li>
</ul>
<span class="tip">La concurrencia optimista conviene cuando hay una proporción mucho más grande de <strong>consultas que de modificaciones</strong>, porque no vamos a tener muchos casos donde se intenten editar los mismos archivos.</span>`,
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
<p><strong>Detección centralizada</strong>: el proceso coordinador mantiene el grafo de uso de recursos; los procesos le envían mensajes cuando obtienen/liberan un recurso y él actualiza el grafo. <strong>El deadlock ocurre cuando se presenta un ciclo</strong>. Problema: los mensajes pueden llegar desordenados y generar <strong>falsos deadlocks</strong> (posible solución: timestamps globales de Lamport).</p>
<p><strong>Detección distribuida</strong>: cuando un proceso debe esperar por un recurso, envía un <em>probe message</em> al proceso que lo tiene. El mensaje contiene: id del proceso que se bloquea, id del que envía y del destinatario. Al recibirlo, el proceso actualiza el id del proceso que envía y el id del destinatario, y lo reenvía a los procesos que tienen el recurso que necesita. <strong>Si el mensaje vuelve al proceso original, hay un ciclo en el grafo.</strong> Ventaja: no hay coordinador → no hay single point of failure.</p>
<span class="tip">Conexión con Coffman: todas estas técnicas atacan la <strong>espera circular</strong>, igual que el orden global de recursos en los filósofos — pero acá el ciclo hay que descubrirlo (o prevenirlo) con mensajes, porque no hay memoria compartida donde mirarlo.</span>`,
      },
      {
        title: 'Ambientes distribuidos: entidades y comportamiento',
        html: `
<p>El modelo formal para razonar sobre sistemas distribuidos. Una <strong>entidad</strong> es la unidad de cómputo del ambiente: puede ser un proceso, un procesador, etc. Cada entidad tiene estas <strong>capacidades</strong>:</p>
<ul>
<li><strong>Acceso de lectura y escritura a una memoria local</strong> (no compartida con otras entidades), que incluye un registro de estado <em>status(x)</em> y un registro de valor de entrada <em>value(x)</em>.</li>
<li><strong>Procesamiento local.</strong></li>
<li><strong>Comunicación</strong>: preparación, transmisión y recepción de mensajes.</li>
<li><strong>Setear y resetear un reloj local.</strong></li>
</ul>
<p>La entidad es <strong>reactiva</strong>: solamente responde a <strong>eventos externos</strong>. Los posibles eventos son: <em>llegada de un mensaje</em> de otra entidad, <em>activación del reloj</em>, y un <em>impulso espontáneo</em> (exterior al sistema). A excepción del impulso espontáneo, todos los eventos se generan dentro de los límites del sistema.</p>
<p><strong>Reglas y comportamiento:</strong></p>
<ul>
<li><strong>Acción</strong>: secuencia finita e indivisible de operaciones. Es <strong>atómica</strong>: se ejecuta sin interrupciones.</li>
<li><strong>Regla</strong>: relación entre el evento que ocurre y el estado en el que se encuentra la entidad cuando ocurre dicho evento, de modo tal que <span class="formula">estado × evento → acción</span>.</li>
<li><strong>Comportamiento</strong> B(x): el conjunto de todas las reglas que obedece una entidad x. Para cada posible evento y estado <strong>debe existir una única regla</strong>. También se lo llama <em>protocolo</em> o <em>algoritmo distribuido</em> de x.</li>
</ul>
<p>El comportamiento colectivo del ambiente es <span class="formula">B(E) = B(x) : ∀x ∈ E</span>. Es <strong>homogéneo</strong> si todas las entidades tienen el mismo comportamiento: <span class="formula">∀x,y ∈ E, B(x) = B(y)</span>.</p>
<span class="tip">Propiedad importante: <strong>todo comportamiento colectivo se puede transformar en homogéneo</strong>. Si hay una entidad líder que hace operaciones distintas al resto, podemos reestructurar la condición de "líder" como un estado interno: frente a X cualidad, hacer Y comportamiento. La reacción es distinta, pero el sistema colectivo se convirtió en homogéneo.</span>`,
      },
      {
        title: 'Axiomas, restricciones y complejidad',
        html: `
<p>Una entidad se comunica con otras mediante <strong>mensajes</strong> (secuencias finitas de bits). Puede que solo pueda comunicarse con un subconjunto del resto:</p>
<ul>
<li><span class="formula">N_out(x) ⊆ E</span>: entidades a las cuales x puede enviarles un mensaje directamente.</li>
<li><span class="formula">N_in(x) ⊆ E</span>: entidades de las cuales x puede recibir un mensaje directamente.</li>
</ul>
<p><strong>Axiomas</strong> (se asumen siempre):</p>
<ul>
<li><strong>Delays de comunicación finitos</strong>: en ausencia de fallas, los delays tienen una duración finita.</li>
<li><strong>Orientación local</strong>: una entidad puede distinguir entre sus vecinos de entrada y de salida — es decir, puede distinguir qué vecino le envía un mensaje, y puede enviar un mensaje a un vecino específico.</li>
</ul>
<p><strong>Restricciones de confiabilidad</strong>: <em>entrega garantizada</em> (cualquier mensaje enviado será recibido con su contenido intacto), <em>confiabilidad parcial</em> (no ocurrirán fallas), <em>confiabilidad total</em> (no han ocurrido ni ocurrirán fallas).</p>
<p><strong>Restricciones temporales</strong>: <em>delays acotados</em> (existe una constante Δ tal que, en ausencia de fallas, el delay de cualquier mensaje es a lo sumo Δ), <em>delays unitarios</em> (el delay de cualquier mensaje en un enlace es igual a una unidad de tiempo) y <em>relojes sincronizados</em> (todos los relojes locales se incrementan simultáneamente y el intervalo de incremento es constante).</p>
<p><strong>Costo y complejidad</strong> — las medidas para comparar algoritmos distribuidos:</p>
<ul>
<li><strong>Cantidad de actividades de comunicación</strong>: cantidad de transmisiones o costo de mensajes (M), y carga de trabajo por entidad. Es importante comparar cuántos mensajes requiere el algoritmo <strong>según la cantidad de entidades</strong> (por ejemplo, cantidad de mensajes para una elección de líder).</li>
<li><strong>Tiempo</strong>: tiempo total de ejecución del protocolo, y <strong>tiempo ideal de ejecución</strong> (medido bajo ciertas condiciones: delays unitarios y relojes sincronizados).</li>
</ul>`,
      },
      {
        title: 'Tiempo, eventos y conocimiento',
        html: `
<p>Las entidades son <strong>reactivas</strong>: solo responden a eventos que reciben. Tipos de eventos: <em>impulso espontáneo</em>, <em>recepción de un mensaje</em> y <em>alarma del reloj activada</em>.</p>
<p>Los distintos <strong>delays</strong> resultan en distintas ejecuciones del protocolo, con posibles <strong>resultados diferentes</strong>. Los eventos disparan acciones que pueden generar nuevos eventos; si suceden, los nuevos eventos ocurrirán en un tiempo futuro: <span class="formula">Future(t)</span>. Una ejecución se describe por la secuencia de eventos que ocurrieron.</p>
<p><strong>Estados y configuraciones</strong>: las entidades tienen un estado interno al que pueden acceder totalmente (leerlo y escribirlo). Se lo llama con la letra <strong>sigma</strong>: el estado interno de x en el instante t, <span class="formula">σ(x,t)</span>, es el contenido de los registros de x y el valor del reloj c<sub>x</sub> en el instante t. El estado interno cambia con la ocurrencia de eventos.</p>
<p>Si una entidad x recibe el mismo evento en dos ejecuciones distintas, y σ1 = σ2, entonces <strong>el nuevo estado interno de x será el mismo en ambas ejecuciones</strong> — el determinismo local dentro del no determinismo global.</p>
<p><strong>Conocimiento</strong>: la información/datos disponibles en un entorno donde múltiples sistemas/nodos operan en conjunto. El <em>conocimiento local</em> es el contenido de la memoria local de x y la información que se deriva de ella; en ausencia de fallas, <strong>el conocimiento local no puede perderse</strong>. Tipos:</p>
<ul>
<li><strong>Información métrica</strong>: información numérica sobre la red. Ej: número de nodos del grafo (n = |V|), número de arcos (m = |E|), diámetro del grafo.</li>
<li><strong>Propiedades topológicas</strong>: conocimiento sobre propiedades de la topología. Ej: el grafo es un anillo, el grafo es acíclico.</li>
<li><strong>Mapas topológicos</strong>: un mapa de la vecindad de la entidad hasta una distancia d. Ej: matriz de adyacencia del grafo.</li>
</ul>
<span class="tip">Por qué importa el conocimiento: muchos algoritmos distribuidos <strong>solo son posibles</strong> si las entidades tienen cierto conocimiento previo. Por ejemplo, elegir líder en un anillo es muy distinto si las entidades saben cuántas son (n) que si no lo saben.</span>`,
      },
    ],
  },
];
