import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

interface Question {
  sec: string;
  q: string;
  /** la correcta va SIEMPRE primera: el componente mezcla las opciones al mostrarlas */
  options: string[];
  correct: number;
  explain: string;
}

const QUESTIONS: Question[] = [
  /* ---------- Intro ---------- */
  {
    sec: 'Intro',
    q: '¿Cuál es la diferencia entre concurrencia y paralelismo?',
    options: [
      'Concurrencia es estructurar el programa en tareas que progresan intercaladas; paralelismo es ejecutarlas literalmente al mismo tiempo en varios núcleos.',
      'Son sinónimos: los dos significan ejecutar al mismo tiempo.',
      'Paralelismo es intercalar tareas en un núcleo; concurrencia es usar varios núcleos.',
      'La concurrencia solo existe en sistemas distribuidos.',
    ],
    correct: 0,
    explain: 'Puede haber concurrencia sin paralelismo: un executor async con un solo hilo intercala miles de tareas. El paralelismo necesita hardware (varios núcleos, SIMD, GPU).',
  },
  {
    sec: 'Intro',
    q: '¿Qué comparten los threads de un mismo proceso y qué tiene cada uno propio?',
    options: [
      'Comparten código, heap y variables globales; cada uno tiene su propio stack y sus registros.',
      'No comparten nada: cada thread tiene su propia copia de la memoria.',
      'Comparten el stack; cada uno tiene su propio heap.',
      'Comparten todo, incluso el stack y el program counter.',
    ],
    correct: 0,
    explain: 'Por eso los threads son livianos (no hay que copiar memoria) y peligrosos (dos pueden tocar el mismo dato del heap). Los procesos, en cambio, tienen espacios de memoria separados.',
  },
  {
    sec: 'Intro',
    q: '¿Qué distingue a la multitarea preemptiva de la colaborativa?',
    options: [
      'En la preemptiva el SO le quita la CPU a la tarea cuando quiere; en la colaborativa la tarea tiene que ceder el control ella misma.',
      'En la preemptiva las tareas ceden el control voluntariamente; en la colaborativa decide el SO.',
      'La colaborativa es la que usan los threads del SO.',
      'No hay diferencia práctica: las dos se comportan igual.',
    ],
    correct: 0,
    explain: 'Threads del SO = preemptivo. Async/await = colaborativo: solo se cambia de tarea en un .await. Por eso una tarea async que nunca cede congela al executor.',
  },
  {
    sec: 'Intro',
    q: '¿Cómo evita Rust los data races en tiempo de compilación?',
    options: [
      'Con ownership y borrowing (muchas &T o una sola &mut T) más los traits Send y Sync.',
      'Con un garbage collector que detecta accesos simultáneos.',
      'Poniendo un Mutex implícito en cada variable.',
      'No los evita: los detecta recién en runtime.',
    ],
    correct: 0,
    explain: 'La regla "muchos lectores XOR un escritor" del borrow checker es la misma que define un data race. Send dice qué se puede mandar a otro hilo y Sync qué se puede compartir. Ojo: Rust evita data races, no deadlocks ni race conditions de lógica.',
  },
  {
    sec: 'Intro',
    q: '¿Por qué el closure de thread::spawn suele llevar move?',
    options: [
      'Porque el hilo puede vivir más que la función que lo creó: tiene que ser dueño de lo que usa (lifetime \'static).',
      'Porque move hace que el hilo corra más rápido.',
      'Porque sin move el hilo no puede leer variables.',
      'Porque move clona automáticamente todas las variables.',
    ],
    correct: 0,
    explain: 'Si el closure tomara prestada una variable del stack, el hilo podría seguir usándola después de que esa función terminó. move transfiere el ownership al hilo. Para compartir de verdad entre hilos se usa Arc.',
  },

  /* ---------- Fork-Join ---------- */
  {
    sec: 'Fork-Join',
    q: '¿Qué condición tiene que cumplir un problema para que fork-join no necesite sincronización?',
    options: [
      'Que las subtareas sean independientes: cada una tiene todos sus datos al empezar y no toca los de las otras.',
      'Que todas las subtareas tarden exactamente lo mismo.',
      'Que haya un Mutex por subtarea.',
      'Que se use una sola cola compartida de tareas.',
    ],
    correct: 0,
    explain: 'Con subtareas aisladas no hay recursos en disputa, así que no hay race conditions y el resultado es determinístico. La única sincronización es el join del final.',
  },
  {
    sec: 'Fork-Join',
    q: 'En work stealing, ¿de qué extremo del deque roba un thread ocioso?',
    options: [
      'Del principio (las tareas más viejas), mientras el dueño saca del final: así no se pisan.',
      'Del final, igual que el dueño, para quedarse con las tareas más nuevas.',
      'De cualquier posición elegida al azar.',
      'No roba: le pide al scheduler central que le asigne una.',
    ],
    correct: 0,
    explain: 'Además, en divide & conquer las tareas del principio son las más grandes (todavía no se partieron): el ladrón se lleva mucho trabajo y por un buen rato no necesita volver a robar.',
  },
  {
    sec: 'Fork-Join',
    q: '¿Por qué conviene un deque por thread en vez de una única cola compartida?',
    options: [
      'Con una cola única todos compiten por el mismo lock; con deques propios solo se sincroniza al robar, que es raro.',
      'Porque una cola única no puede guardar más de N tareas.',
      'Porque con una cola única las tareas se ejecutan en orden inverso.',
      'Porque los deques no necesitan memoria.',
    ],
    correct: 0,
    explain: 'Sumá la localidad de caché: cada thread sigue con las subtareas que él mismo creó, cuyos datos ya están en la caché de su núcleo.',
  },
  {
    sec: 'Fork-Join',
    q: '¿Qué hace una instrucción SIMD como vmulq_f32?',
    options: [
      'Multiplica 4 floats contra otros 4 en una sola instrucción, uno por cada lane del registro.',
      'Lanza 4 threads que multiplican en paralelo.',
      'Multiplica un float por 4 en un solo ciclo.',
      'Reparte la multiplicación entre la CPU y la GPU.',
    ],
    correct: 0,
    explain: 'SIMD = Single Instruction, Multiple Data: el mismo cálculo sobre varios datos del mismo registro. Es una operación vertical (lane a lane); vaddvq_f32, en cambio, es horizontal (suma los lanes entre sí).',
  },
  {
    sec: 'Fork-Join',
    q: 'Una GPU tiene miles de núcleos. ¿Cuándo puede salir PEOR que la CPU?',
    options: [
      'Cuando copiar los datos a la GPU y traer el resultado cuesta más que el cálculo en sí.',
      'Nunca: más núcleos siempre es más rápido.',
      'Cuando la imagen tiene más de 1000 píxeles.',
      'Cuando se usa WGSL en vez de CUDA.',
    ],
    correct: 0,
    explain: 'La GPU optimiza throughput, no latencia. Conviene con mucho trabajo independiente y uniforme sobre muchos datos; para tareas chicas, la transferencia host ↔ device domina.',
  },

  /* ---------- Locks ---------- */
  {
    sec: 'Locks',
    q: '¿Cuál de estas es una propiedad de LIVENESS?',
    options: [
      'Ausencia de starvation: si un proceso quiere entrar a la sección crítica, en algún momento entra.',
      'Exclusión mutua: nunca hay dos procesos en la sección crítica.',
      'Que el contador nunca sea negativo.',
      'Que nunca se lea un dato a medio escribir.',
    ],
    correct: 0,
    explain: 'Safety = "nunca pasa algo malo" (se viola en un instante concreto). Liveness = "eventualmente pasa algo bueno" (solo se viola en una ejecución infinita). Starvation y fairness son de liveness.',
  },
  {
    sec: 'Locks',
    q: 'Dos hilos hacen contador += 1 mil veces cada uno. ¿Por qué el resultado puede dar menos de 2000?',
    options: [
      'Porque son tres operaciones (leer, sumar, escribir): si los dos leen antes de que el otro escriba, se pierde un incremento.',
      'Porque el compilador elimina la mitad de las sumas.',
      'Porque los hilos no pueden escribir la misma variable.',
      'Porque el scheduler ejecuta solo uno de los hilos.',
    ],
    correct: 0,
    explain: 'Es el lost update, la race condition canónica. Se arregla con un Mutex o con AtomicUsize::fetch_add, que hace las tres cosas en una operación atómica.',
  },
  {
    sec: 'Locks',
    q: '¿Por qué no se puede mandar un Rc<T> a otro thread?',
    options: [
      'Porque su contador de referencias no es atómico: dos hilos podrían corromperlo y liberar la memoria antes de tiempo. Rc no es Send.',
      'Porque Rc solo funciona con tipos primitivos.',
      'Porque Rc es más lento que Arc.',
      'Sí se puede, solo hay que clonarlo antes.',
    ],
    correct: 0,
    explain: 'El compilador lo rechaza con el error E0277. Arc usa operaciones atómicas en el contador. Y ojo: Arc permite COMPARTIR el puntero, no MUTAR el dato; para eso hace falta Arc<Mutex<T>>.',
  },
  {
    sec: 'Locks',
    q: '¿Cuándo queda "envenenado" un Mutex en Rust?',
    options: [
      'Cuando un hilo hace panic mientras tiene el lock tomado: el dato pudo quedar a medio modificar.',
      'Cuando dos hilos piden el lock al mismo tiempo.',
      'Cuando se olvida llamar a unlock().',
      'Cuando el Mutex se usa sin Arc.',
    ],
    correct: 0,
    explain: 'A partir de ahí lock() devuelve Err. Por eso el .unwrap() de siempre. Y no existe "olvidarse el unlock": el MutexGuard lo libera solo al salir de scope (RAII).',
  },
  {
    sec: 'Locks',
    q: '¿Cuál es el riesgo típico de un RwLock con muchas lecturas?',
    options: [
      'Starvation del escritor: si siempre hay algún lector adentro, el escritor nunca consigue el acceso exclusivo.',
      'Que dos escritores escriban a la vez.',
      'Que los lectores lean datos a medio escribir.',
      'Deadlock entre lectores.',
    ],
    correct: 0,
    explain: 'La regla es muchos lectores XOR un escritor. Las implementaciones suelen priorizar a los escritores encolados para evitar la starvation.',
  },
  {
    sec: 'Locks',
    q: '¿Cuáles son los tres requisitos de una solución al problema de la sección crítica?',
    options: [
      'Exclusión mutua, progreso y espera acotada.',
      'Atomicidad, consistencia y durabilidad.',
      'Velocidad, simplicidad y portabilidad.',
      'Exclusión mutua, preemption y espera circular.',
    ],
    correct: 0,
    explain: 'Exclusión mutua (a lo sumo uno adentro), progreso (si nadie está adentro y alguien quiere, alguien entra) y espera acotada (nadie espera para siempre mientras otros entran una y otra vez).',
  },

  /* ---------- Sincronización ---------- */
  {
    sec: 'Sincronización',
    q: 'Un proceso hace signal(S) y hay procesos bloqueados en S. ¿Qué pasa con S.V?',
    options: [
      'No cambia: despierta a uno de los bloqueados (cualquiera) y S.V queda igual.',
      'Se incrementa en 1 y además despierta a uno.',
      'Se pone en 0.',
      'Se decrementa en 1.',
    ],
    correct: 0,
    explain: 'Solo si L está vacío se hace S.V := S.V + 1. Si hay alguien esperando, el "recurso" se le pasa directo a ese proceso. Invariante: S.V = k + #signal − #wait.',
  },
  {
    sec: 'Sincronización',
    q: 'En el productor-consumidor acotado, ¿con qué valor arranca el semáforo notFull?',
    options: [
      'Con N, el tamaño del buffer: al principio todos los lugares están libres.',
      'Con 0, porque todavía no se produjo nada.',
      'Con 1, porque es un semáforo binario.',
      'Con N − 1, para dejar un lugar de reserva.',
    ],
    correct: 0,
    explain: 'notEmpty arranca en 0 (no hay ítems) y notFull en N (todo libre). notEmpty + notFull = N siempre que nadie esté a mitad de una operación.',
  },
  {
    sec: 'Sincronización',
    q: 'En el productor, ¿por qué hay que hacer wait(notFull) ANTES de tomar el mutex del buffer?',
    options: [
      'Si tomás el mutex y después te bloqueás en notFull, te dormís con el lock tomado y el consumidor nunca puede liberar lugar: deadlock.',
      'Porque el mutex solo se puede tomar con el buffer vacío.',
      'Es indistinto: el orden no cambia nada.',
      'Para que el productor sea más rápido que el consumidor.',
    ],
    correct: 0,
    explain: 'Regla: semáforo de condición primero, mutex después. Es la trampa clásica de este problema.',
  },
  {
    sec: 'Sincronización',
    q: '¿Por qué la espera en una condition variable va dentro de un while y no de un if?',
    options: [
      'Por los despertares espurios y porque otro hilo pudo cambiar la condición entre el notify y la re-adquisición del lock.',
      'Porque if no compila con condvars en Rust.',
      'Porque el while hace busy-waiting y es más rápido.',
      'Para que el hilo despierte a los demás.',
    ],
    correct: 0,
    explain: 'wait() suelta el lock y duerme atómicamente; al despertar lo re-adquiere. Pero la condición hay que volver a chequearla con el lock en mano.',
  },
  {
    sec: 'Sincronización',
    q: '¿Qué pasa con un signalC sobre una condition variable sin nadie esperando, comparado con un signal de semáforo?',
    options: [
      'El signalC se pierde (no tiene efecto); el signal del semáforo queda "guardado" incrementando el contador.',
      'Los dos se pierden.',
      'Los dos quedan guardados para el próximo wait.',
      'El signalC bloquea al que lo hace hasta que alguien espere.',
    ],
    correct: 0,
    explain: 'La condition variable no guarda valor: solo tiene una cola. Otras diferencias: waitC siempre bloquea, y signalC despierta al primero de la cola (FIFO), no a uno arbitrario.',
  },
  {
    sec: 'Sincronización',
    q: 'En una Barrier de Rust, ¿quién recibe is_leader() == true?',
    options: [
      'Un solo hilo por ronda: el último que llegó a la barrera.',
      'El primer hilo que llegó.',
      'Todos los hilos.',
      'El hilo que creó la barrera.',
    ],
    correct: 0,
    explain: 'Sirve para hacer un trabajo único entre fases, como consolidar resultados. Las barreras de Rust se reutilizan solas para la ronda siguiente.',
  },
  {
    sec: 'Sincronización',
    q: 'En los filósofos, hacer que uno tome los tenedores en orden inverso al resto, ¿qué condición de Coffman rompe?',
    options: [
      'La espera circular.',
      'La exclusión mutua.',
      'Hold and wait.',
      'No preemption.',
    ],
    correct: 0,
    explain: 'Con un orden global de recursos no se puede cerrar el ciclo. Las 4 condiciones tienen que darse juntas, así que alcanza con romper una. try_lock + soltar todo rompe hold-and-wait, pero puede caer en livelock.',
  },
  {
    sec: 'Sincronización',
    q: '¿Cuál es la diferencia entre deadlock y livelock?',
    options: [
      'En deadlock nadie se mueve; en livelock los procesos se mueven (sueltan y reintentan) pero ninguno progresa.',
      'Son lo mismo con distinto nombre.',
      'El livelock solo pasa en sistemas distribuidos.',
      'En livelock un proceso progresa y los demás no.',
    ],
    correct: 0,
    explain: 'Lo de "uno con mala suerte sistemática mientras el resto progresa" es starvation, no livelock.',
  },

  /* ---------- Petri ---------- */
  {
    sec: 'Petri',
    q: '¿Cuándo está habilitada una transición t en una red general?',
    options: [
      'Cuando cada lugar de entrada p tiene al menos W(p,t) tokens.',
      'Cuando al menos uno de sus lugares de entrada tiene tokens.',
      'Cuando sus lugares de salida están vacíos.',
      'Cuando es la única transición que puede disparar.',
    ],
    correct: 0,
    explain: 'Tiene que cumplirse en TODAS las entradas. Al disparar consume W(p,t) de cada entrada y produce W(t,p\') en cada salida, atómicamente.',
  },
  {
    sec: 'Petri',
    q: '¿Qué diferencia una red de Petri ordinaria de una general?',
    options: [
      'En la general los arcos tienen peso (W: A → ℕ); en la ordinaria todo arco vale 1.',
      'La general permite arcos entre dos lugares.',
      'La ordinaria no tiene marcado inicial.',
      'La general tiene arcos inhibidores obligatorios.',
    ],
    correct: 0,
    explain: 'Con funciones de entrada y salida: en la ordinaria I(t) y O(t) son conjuntos; en la general son multiconjuntos y la multiplicidad de p en I(t) es el peso W(p,t).',
  },
  {
    sec: 'Petri',
    q: '¿Para qué sirve un arco inhibidor?',
    options: [
      'Para habilitar una transición solo si su lugar está VACÍO, algo que una red clásica no puede expresar.',
      'Para que una transición consuma el doble de tokens.',
      'Para bloquear una transición para siempre.',
      'Para conectar dos transiciones directamente.',
    ],
    correct: 0,
    explain: 'Hace falta en lector-escritor: el escritor entra solo si no hay lectores. El inhibidor no consume tokens, y le da a las redes poder de Turing.',
  },
  {
    sec: 'Petri',
    q: 'En un grafo de alcance, ¿cómo se reconoce un deadlock?',
    options: [
      'Como un marcado muerto: un nodo sin aristas de salida, porque no hay ninguna transición habilitada.',
      'Como un ciclo en el grafo.',
      'Como un nodo con muchas aristas de entrada.',
      'Como un lugar con más de k tokens.',
    ],
    correct: 0,
    explain: 'Los ciclos son normales (muestran que el sistema vuelve a estados anteriores). Si no hay ningún marcado muerto alcanzable, la red no tiene deadlock: queda demostrado para todas las ejecuciones.',
  },
  {
    sec: 'Petri',
    q: 'Si un lugar puede acumular tokens sin límite, ¿qué pasa con el grafo de alcance?',
    options: [
      'Es infinito: la red no es acotada.',
      'Tiene un solo nodo.',
      'Queda igual, porque los tokens extra no cuentan.',
      'Aparece un marcado muerto.',
    ],
    correct: 0,
    explain: 'Una red es k-acotada si ningún lugar supera k tokens en ningún marcado alcanzable. Modelando un buffer, que no sea acotada significa un buffer que explota.',
  },
  {
    sec: 'Petri',
    q: 'En el productor-consumidor acotado modelado con Petri, ¿qué invariante garantiza que el buffer no desborde?',
    options: [
      'buffer + libres = N en todo marcado alcanzable.',
      'buffer = libres en todo momento.',
      'Que el productor y el consumidor tengan un token cada uno.',
      'Que el grafo de alcance tenga N nodos.',
    ],
    correct: 0,
    explain: 'Depositar consume un "libre" y produce un "ítem"; retirar hace lo inverso. La suma nunca cambia, así que buffer ≤ N siempre.',
  },

  /* ---------- Mensajes ---------- */
  {
    sec: 'Mensajes',
    q: 'En std::sync::mpsc, ¿qué extremo del canal se puede clonar?',
    options: [
      'El Sender (tx): puede haber muchos productores, pero un solo Receiver.',
      'El Receiver (rx): puede haber muchos consumidores.',
      'Los dos.',
      'Ninguno: el canal es uno a uno.',
    ],
    correct: 0,
    explain: 'mpsc = multiple producer, single consumer. Si necesitás varios consumidores, se comparte el Receiver con Arc<Mutex<..>> o se usa otro tipo de canal.',
  },
  {
    sec: 'Mensajes',
    q: '¿Cuándo devuelve Err el recv() de un canal mpsc?',
    options: [
      'Cuando todos los Sender se droppearon y ya no queda nada en el canal.',
      'Cuando el canal está vacío.',
      'Cuando el mensaje es muy grande.',
      'Nunca: recv() bloquea para siempre.',
    ],
    correct: 0,
    explain: 'Así se detecta el fin: cerrar el canal (droppear los tx) es el "join" natural de un pipeline. Si está vacío pero hay senders vivos, recv() bloquea.',
  },
  {
    sec: 'Mensajes',
    q: '¿Qué pasa con un dato después de hacer tx.send(dato)?',
    options: [
      'Su ownership pasa al receptor: el productor ya no puede usarlo, y el compilador lo verifica.',
      'Se copia: los dos siguen teniendo su versión.',
      'Queda compartido entre los dos con un lock implícito.',
      'Se destruye y el receptor recibe una referencia.',
    ],
    correct: 0,
    explain: '"No compartas memoria para comunicarte: comunicate para compartir memoria." El borrow checker convierte esa regla en algo que se chequea al compilar.',
  },
  {
    sec: 'Mensajes',
    q: '¿Por qué un actor no necesita Mutex para proteger su estado?',
    options: [
      'Porque su estado es privado y procesa los mensajes de su mailbox de a uno: eso ya es exclusión mutua.',
      'Porque los actores corren siempre en un solo núcleo.',
      'Porque Actix pone un Mutex automático en cada campo.',
      'Sí lo necesita, igual que cualquier struct compartido.',
    ],
    correct: 0,
    explain: 'Nadie más puede tocar el estado del actor, y él procesa un mensaje por vez. El precio: todo pasa a ser asincrónico y hay que diseñar bien los mensajes.',
  },
  {
    sec: 'Mensajes',
    q: 'Ante un mensaje, ¿qué cosas puede hacer un actor según el modelo?',
    options: [
      'Mandar mensajes a actores que conoce, crear actores nuevos y definir cómo va a tratar el próximo mensaje (cambiar su estado).',
      'Leer y escribir el estado de cualquier otro actor.',
      'Bloquearse esperando un lock global.',
      'Solo responder al que le escribió.',
    ],
    correct: 0,
    explain: 'Esas tres acciones son toda la definición del modelo (Hewitt). No hay memoria compartida: un actor nunca toca el estado de otro.',
  },
  {
    sec: 'Mensajes',
    q: '¿Qué es un Arbiter en Actix?',
    options: [
      'Un thread del SO con su propio event loop donde viven y se ejecutan uno o más actores.',
      'Un actor especial que reparte los mensajes entre los demás.',
      'El lock que protege el mailbox de cada actor.',
      'Un proceso separado por cada actor.',
    ],
    correct: 0,
    explain: 'Los actores de un mismo Arbiter comparten un hilo: hay concurrencia pero no paralelismo. Para usar varios núcleos se reparten en varios Arbiters, y el trabajo pesado va a un SyncArbiter.',
  },
  {
    sec: 'Mensajes',
    q: '¿En qué se diferencian do_send y send en Actix?',
    options: [
      'do_send es "fire-and-forget" (no espera respuesta); send devuelve un Future que se puede await para obtener la respuesta.',
      'do_send es sincrónico y send es asincrónico, pero los dos devuelven la respuesta.',
      'send no garantiza la entrega y do_send sí.',
      'Son lo mismo: do_send es un alias.',
    ],
    correct: 0,
    explain: 'Y try_send intenta mandar al toque: falla si la casilla está llena o cerrada.',
  },

  /* ---------- Async ---------- */
  {
    sec: 'Async',
    q: '¿Qué pasa cuando llamás a una async fn sin hacerle .await?',
    options: [
      'Nada se ejecuta todavía: devuelve un Future que guarda los argumentos y el cuerpo corre recién cuando alguien lo pollea.',
      'Se ejecuta completa en un thread nuevo.',
      'Se ejecuta hasta el primer await y se frena.',
      'El programa no compila.',
    ],
    correct: 0,
    explain: 'Los futures son perezosos: alguien (el executor) tiene que pollearlos. Recién en el primer poll se ejecuta el cuerpo hasta el primer await.',
  },
  {
    sec: 'Async',
    q: '¿Qué devuelve poll() si el future todavía no terminó?',
    options: [
      'Poll::Pending, sin bloquear; el waker avisará cuándo vale la pena volver a pollear.',
      'Bloquea hasta que el resultado esté listo.',
      'Poll::Ready(None).',
      'Un error.',
    ],
    correct: 0,
    explain: 'poll() nunca bloquea: avanza todo lo que puede, guarda su estado y contesta. Es el modelo piñata: le pegás hasta que cae el valor.',
  },
  {
    sec: 'Async',
    q: 'Una tarea async hace un cálculo de 2 segundos sin ningún await. ¿Qué pasa con las otras tareas del mismo executor?',
    options: [
      'Quedan congeladas esos 2 segundos: el cambio de tarea solo ocurre en un .await.',
      'Siguen corriendo, porque el executor las alterna solo.',
      'Se cancelan.',
      'El SO reparte la CPU entre todas, como con threads.',
    ],
    correct: 0,
    explain: 'El modelo es cooperativo. Para eso están task::spawn_blocking (manda el cálculo a otro thread) y task::yield_now().await (cede el control a mitad de un loop).',
  },
  {
    sec: 'Async',
    q: '¿Por qué no hay que llamar a block_on dentro de una función async?',
    options: [
      'Porque bloquea el thread entero del executor, y con él a todas las tareas que corren en ese thread.',
      'Porque block_on solo funciona con threads.',
      'Porque devuelve el resultado en otro tipo.',
      'Se puede sin problema: es lo mismo que await.',
    ],
    correct: 0,
    explain: 'block_on es el adaptador del mundo sincrónico al async (típicamente en main). Adentro de código async se usa .await.',
  },
  {
    sec: 'Async',
    q: '¿Para qué existe Pin en los futures?',
    options: [
      'Porque los futures pueden tener referencias a sí mismos: si se movieran en memoria, esos punteros quedarían apuntando a basura.',
      'Para que el future corra siempre en el mismo thread.',
      'Para que el future no se pueda cancelar.',
      'Para hacer el future más rápido.',
    ],
    correct: 0,
    explain: 'La máquina de estados de una async fn guarda sus variables locales, y una puede apuntar a otra. Pin garantiza a nivel de tipos que el valor no se va a mover.',
  },
  {
    sec: 'Async',
    q: '¿Para cuál de estos casos conviene async y no threads?',
    options: [
      'Un servidor con miles de conexiones abiertas que pasan casi todo el tiempo esperando la red.',
      'Multiplicar dos matrices enormes.',
      'Comprimir un archivo de 10 GB.',
      'Calcular un factorial grande.',
    ],
    correct: 0,
    explain: 'Async: mucho I/O y poco cálculo, cada tarea pesa ~1 KB. Threads o rayon: cálculo pesado, porque async no te da más núcleos.',
  },

  /* ---------- Distribuidos ---------- */
  {
    sec: 'Distribuidos',
    q: 'Con relojes de Lamport, un proceso con C = 5 recibe un mensaje con timestamp 9. ¿Cuánto vale C después?',
    options: [
      '10: C = max(C, ts) + 1.',
      '6: C = C + 1.',
      '9: toma el del mensaje.',
      '14: suma los dos.',
    ],
    correct: 0,
    explain: 'Si el reloj venía atrasado, se adelanta. Así se garantiza que si a → b entonces C(a) < C(b).',
  },
  {
    sec: 'Distribuidos',
    q: 'Con relojes de Lamport, si C(a) < C(b), ¿se puede afirmar que a ocurrió antes que b?',
    options: [
      'No: la implicación va en un solo sentido. Pueden ser eventos concurrentes con números distintos por casualidad.',
      'Sí, siempre.',
      'Sí, siempre que los relojes físicos estén sincronizados.',
      'Solo si la diferencia es mayor que 1.',
    ],
    correct: 0,
    explain: 'Lamport garantiza a → b ⇒ C(a) < C(b), no la vuelta. Para el orden total se desempata con el id del proceso: el par (C, id).',
  },
  {
    sec: 'Distribuidos',
    q: 'En Ricart-Agrawala, dos procesos quieren entrar a la sección crítica a la vez. ¿Quién entra primero?',
    options: [
      'El de menor timestamp: el otro le responde OK y encola su propio pedido.',
      'El de mayor id.',
      'El que tiene el token.',
      'El que le pregunta al coordinador primero.',
    ],
    correct: 0,
    explain: 'Cuesta 2(n − 1) mensajes por acceso. Su debilidad: si cualquier proceso se cae, nunca responde y su silencio se interpreta como denegación: n puntos de falla en vez de uno.',
  },
  {
    sec: 'Distribuidos',
    q: '¿Cuántos mensajes usa la exclusión mutua centralizada por cada entrada y salida, y cuál es su problema?',
    options: [
      '3 (request, grant, release); su problema es el coordinador como single point of failure.',
      '2(n − 1); su problema es que un proceso caído bloquea a todos.',
      'Ninguno; su problema es el token perdido.',
      '1; su problema es la starvation.',
    ],
    correct: 0,
    explain: 'Es el más simple y el más eficiente. El distribuido (Ricart-Agrawala) usa 2(n − 1), y el token ring entre 1 e infinito.',
  },
  {
    sec: 'Distribuidos',
    q: 'En el algoritmo Bully, ¿quién termina siendo coordinador?',
    options: [
      'El proceso vivo de mayor id.',
      'El primero que detectó la caída.',
      'El de menor id.',
      'Uno elegido al azar.',
    ],
    correct: 0,
    explain: 'Cada uno le manda ELECTION a los de id mayor; si alguno responde, se baja. Peor caso O(n²) mensajes. En el anillo, el mensaje junta los ids vivos y gana el máximo.',
  },
  {
    sec: 'Distribuidos',
    q: '¿Por qué se dice que two-phase commit es bloqueante?',
    options: [
      'Si el coordinador se cae después de juntar los votos y antes de mandar la decisión, los participantes que votaron SÍ quedan esperando con los locks tomados.',
      'Porque usa sockets bloqueantes.',
      'Porque solo una transacción puede correr a la vez en todo el sistema.',
      'Porque el coordinador bloquea a los que votaron NO.',
    ],
    correct: 0,
    explain: 'Quien votó SÍ prometió poder commitear: ya no puede decidir solo. Por eso existen 3PC y los protocolos de consenso.',
  },
  {
    sec: 'Distribuidos',
    q: 'En two-phase locking, ¿qué NO se puede hacer en la fase de contracción?',
    options: [
      'Tomar un lock nuevo.',
      'Liberar un lock.',
      'Leer un dato que ya está lockeado.',
      'Hacer commit.',
    ],
    correct: 0,
    explain: 'Primero se toman todos los locks (expansión), después solo se liberan (contracción). Garantiza serializabilidad, pero puede haber deadlocks. En 2PL estricto los locks se liberan recién después del commit.',
  },
  {
    sec: 'Distribuidos',
    q: 'Wait-die: una transacción VIEJA pide un recurso que tiene una JOVEN. ¿Qué pasa?',
    options: [
      'La vieja espera.',
      'La vieja aborta.',
      'La joven aborta.',
      'Las dos abortan.',
    ],
    correct: 0,
    explain: 'Wait-die: viejo espera, joven que pide muere. Wound-wait: viejo "hiere" (aborta) al joven, joven que pide espera. En los dos aborta siempre la más joven, que estadísticamente hizo menos trabajo.',
  },
  {
    sec: 'Distribuidos',
    q: 'Un sistema de reservas tiene muchísima contención en horario pico: todos quieren los mismos turnos. ¿Qué control de concurrencia conviene?',
    options: [
      '2PL (pesimista): las transacciones hacen fila en vez de abortar y rehacer todo el trabajo.',
      'Optimista, porque no usa locks.',
      'Timestamps, porque nunca abortan.',
      'Ninguno: con mucha carga conviene no controlar nada.',
    ],
    correct: 0,
    explain: 'Con muchos conflictos, el optimista y los timestamps abortan casi todo y los reintentos suman más carga en el pico. El optimista conviene con muchas más lecturas que escrituras y pocos conflictos.',
  },
  {
    sec: 'Distribuidos',
    q: 'En la detección distribuida de deadlocks con probes, ¿cuándo se concluye que hay deadlock?',
    options: [
      'Cuando el probe vuelve al proceso que lo originó: hay un ciclo en el grafo de espera.',
      'Cuando un proceso espera más de un timeout.',
      'Cuando el coordinador encuentra un ciclo en su grafo.',
      'Cuando el probe no recibe respuesta.',
    ],
    correct: 0,
    explain: 'El probe sigue las cadenas de espera. No hay coordinador, así que no hay single point of failure. El del coordinador con grafo completo es la detección centralizada, que puede dar falsos deadlocks.',
  },
  {
    sec: 'Distribuidos',
    q: 'En un ambiente distribuido, ¿qué es la regla de una entidad?',
    options: [
      'La relación estado × evento → acción: qué acción ejecuta la entidad ante cada evento según el estado en que está.',
      'El conjunto de todas las acciones de la entidad.',
      'Una secuencia indivisible de operaciones.',
      'El protocolo de red que usa la entidad.',
    ],
    correct: 0,
    explain: 'Acción = secuencia finita e indivisible de operaciones. Comportamiento = el conjunto de todas las reglas, con una única regla para cada par (estado, evento).',
  },
  {
    sec: 'Distribuidos',
    q: '¿Cuáles son los tipos de eventos a los que reacciona una entidad en un ambiente distribuido?',
    options: [
      'Impulso espontáneo, llegada de un mensaje y alarma del reloj.',
      'Lectura, escritura y commit.',
      'Lock, unlock y signal.',
      'Envío de un mensaje, recepción y timeout de red.',
    ],
    correct: 0,
    explain: 'La entidad es reactiva: solo responde a eventos. Todos se generan dentro del sistema, salvo el impulso espontáneo, que viene de afuera.',
  },
  {
    sec: 'Distribuidos',
    q: '¿Cuáles son los tipos de conocimiento en un ambiente distribuido?',
    options: [
      'Información métrica, propiedades topológicas y mapas topológicos.',
      'Conocimiento global, local y compartido.',
      'Estado, evento y acción.',
      'Lecturas, escrituras y commits.',
    ],
    correct: 0,
    explain: 'Métrica: números sobre la red (cantidad de nodos, diámetro). Propiedades topológicas: "es un anillo", "es acíclico". Mapas topológicos: la vecindad hasta distancia d, como una matriz de adyacencia.',
  },
];

@Component({
  selector: 'app-quiz-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="anim">
      <div class="head">
        <div class="titles">
          <div class="title">🎯 Modo Quiz: autoevaluación tipo final</div>
          <div class="caption">Filtrá por sección o respondé todas. Cada pregunta trae la trampa explicada.</div>
        </div>
        <div class="score">Aciertos: <b>{{ score() }}</b> / {{ answeredCount() }}</div>
      </div>

      <div class="filters">
        <button class="fchip" [class.on]="filter() === 'all'" (click)="setFilter('all')">Todas ({{ total }})</button>
        @for (s of sections; track s) {
          <button class="fchip" [class.on]="filter() === s" (click)="setFilter(s)">{{ s }}</button>
        }
      </div>

      @if (pool().length === 0) {
        <div class="empty">No hay preguntas para esa sección.</div>
      } @else if (finished()) {
        <div class="result">
          <div class="rbig">{{ resultEmoji() }}</div>
          <div class="rscore">{{ score() }} / {{ pool().length }}</div>
          <div class="rmsg">{{ resultMsg() }}</div>
          <button class="restart" (click)="restart()">↺ Reintentar</button>
        </div>
      } @else {
        <div class="progress">
          <div class="pbar"><div class="pfill" [style.width.%]="(idx() / pool().length) * 100"></div></div>
          <span class="pnum">Pregunta {{ idx() + 1 }} de {{ pool().length }}</span>
          <span class="psec">{{ current().sec }}</span>
        </div>

        <div class="qcard">
          <div class="qtext">{{ current().q }}</div>
          <div class="opts">
            @for (o of current().options; track $index; let i = $index) {
              <button class="opt"
                      [class.correct]="answered() && i === current().correct"
                      [class.wrong]="answered() && i === selected() && i !== current().correct"
                      [class.locked]="answered()"
                      [disabled]="answered()"
                      (click)="answer(i)">
                <span class="oletter">{{ letters[i] }}</span>
                <span class="otext">{{ o }}</span>
                @if (answered() && i === current().correct) { <span class="omark ok">✔</span> }
                @if (answered() && i === selected() && i !== current().correct) { <span class="omark no">✗</span> }
              </button>
            }
          </div>

          @if (answered()) {
            <div class="explain" [class.good]="selected() === current().correct">
              <b>{{ selected() === current().correct ? '¡Correcto!' : 'Casi…' }}</b>
              {{ current().explain }}
            </div>
            <div class="qactions">
              <button class="nextb" (click)="next()">
                {{ idx() === pool().length - 1 ? 'Ver resultado →' : 'Siguiente →' }}
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .anim { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 18px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 1.02rem; color: #fff; }
    .caption { color: var(--text-dim); font-size: 0.85rem; margin-top: 2px; }
    .score { background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; font-size: 0.85rem; color: var(--text-dim); white-space: nowrap; }
    .score b { color: #7ee787; font-size: 1.05rem; }

    .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .fchip { background: var(--panel-2); color: var(--text-dim); border: 1px solid var(--border); border-radius: 16px; padding: 5px 12px; cursor: pointer; font-size: 0.78rem; transition: all 0.15s; }
    .fchip:hover { color: var(--text); border-color: #4a5878; }
    .fchip.on { background: #1f6feb; border-color: #1f6feb; color: #fff; font-weight: 700; }

    .empty { color: var(--text-dim); font-style: italic; padding: 20px; text-align: center; }

    .progress { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .pbar { flex: 1; min-width: 120px; height: 8px; background: #10151f; border-radius: 4px; overflow: hidden; border: 1px solid var(--border); }
    .pfill { height: 100%; background: linear-gradient(90deg, #1f6feb, #58a6ff); transition: width 0.3s; }
    .pnum { font-size: 0.78rem; color: var(--text-dim); white-space: nowrap; }
    .psec { font-size: 0.72rem; color: #ffd54f; border: 1px solid #d2992244; border-radius: 12px; padding: 2px 10px; white-space: nowrap; }

    .qcard { background: #10151f; border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
    .qtext { font-size: 1.05rem; font-weight: 600; color: #fff; margin-bottom: 16px; line-height: 1.4; }
    .opts { display: flex; flex-direction: column; gap: 8px; }
    .opt {
      display: flex; align-items: center; gap: 12px; text-align: left;
      background: var(--panel-2); border: 1.5px solid var(--border); border-radius: 10px;
      padding: 12px 14px; cursor: pointer; color: var(--text); font-size: 0.92rem; transition: all 0.15s; width: 100%;
    }
    .opt:hover:not(.locked) { border-color: #1f6feb; background: #232b3e; }
    .opt.locked { cursor: default; }
    .opt.correct { border-color: #2ea043; background: rgba(46,160,67,0.12); }
    .opt.wrong { border-color: #ef5350; background: rgba(239,83,80,0.12); }
    .oletter { flex-shrink: 0; width: 26px; height: 26px; border-radius: 7px; background: #0b0f19; border: 1px solid var(--border); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; color: var(--text-dim); }
    .opt.correct .oletter { background: #2ea043; color: #fff; border-color: #2ea043; }
    .opt.wrong .oletter { background: #ef5350; color: #fff; border-color: #ef5350; }
    .otext { flex: 1; line-height: 1.4; }
    .omark { flex-shrink: 0; font-weight: 900; font-size: 1.1rem; }
    .omark.ok { color: #7ee787; } .omark.no { color: #ef9a9a; }

    .explain { margin-top: 14px; background: rgba(239,83,80,0.08); border-left: 3px solid #ef5350; border-radius: 0 8px 8px 0; padding: 11px 14px; font-size: 0.88rem; line-height: 1.55; color: var(--text); }
    .explain.good { background: rgba(46,160,67,0.1); border-left-color: #2ea043; }
    .explain b { color: #fff; margin-right: 4px; }
    .qactions { display: flex; justify-content: flex-end; margin-top: 14px; }
    .nextb { background: #1f6feb; border: none; color: #fff; font-weight: 700; border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 0.92rem; }
    .nextb:hover { background: #388bfd; }

    .result { text-align: center; padding: 30px 16px; }
    .rbig { font-size: 3.4rem; line-height: 1; }
    .rscore { font-size: 2rem; font-weight: 800; color: #ffd54f; margin: 8px 0 4px; font-family: Consolas, monospace; }
    .rmsg { color: var(--text-dim); font-size: 0.95rem; margin-bottom: 20px; }
    .restart { background: var(--panel-2); border: 1px solid var(--border); color: var(--text); font-weight: 700; border-radius: 10px; padding: 10px 22px; cursor: pointer; font-size: 0.92rem; }
    .restart:hover { border-color: #1f6feb; background: #232b3e; }
  `,
})
export class QuizDetail {
  readonly total = QUESTIONS.length;
  readonly letters = ['A', 'B', 'C', 'D', 'E'];
  readonly sections = [...new Set(QUESTIONS.map((q) => q.sec))];

  readonly filter = signal<string>('all');
  readonly idx = signal(0);
  readonly selected = signal<number | null>(null);
  readonly score = signal(0);
  readonly answeredCount = signal(0);
  /** cambia en cada restart para re-mezclar las opciones */
  private readonly shuffleTick = signal(0);

  readonly pool = computed(() => {
    this.shuffleTick();
    const base = this.filter() === 'all' ? QUESTIONS : QUESTIONS.filter((q) => q.sec === this.filter());
    // mezcla las opciones de cada pregunta (si no, la correcta siempre sería la A)
    return base.map((q) => {
      const order = q.options.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return {
        ...q,
        options: order.map((i) => q.options[i]),
        correct: order.indexOf(q.correct),
      };
    });
  });

  readonly current = computed(() => this.pool()[this.idx()]);
  readonly answered = computed(() => this.selected() !== null);
  readonly finished = computed(() => this.pool().length > 0 && this.idx() >= this.pool().length);

  setFilter(s: string): void {
    if (this.filter() === s) return;
    this.filter.set(s);
    this.restart();
  }

  answer(i: number): void {
    if (this.selected() !== null) return;
    this.selected.set(i);
    this.answeredCount.update((n) => n + 1);
    if (i === this.current().correct) this.score.update((n) => n + 1);
  }

  next(): void {
    this.idx.update((n) => n + 1);
    this.selected.set(null);
  }

  restart(): void {
    this.idx.set(0);
    this.selected.set(null);
    this.score.set(0);
    this.answeredCount.set(0);
    this.shuffleTick.update((n) => n + 1);
  }

  resultEmoji(): string {
    const r = this.score() / this.pool().length;
    return r >= 0.9 ? '🏆' : r >= 0.7 ? '🎉' : r >= 0.5 ? '👍' : '📚';
  }
  resultMsg(): string {
    const r = this.score() / this.pool().length;
    if (r >= 0.9) return '¡Listo para el final! Dominás las trampas.';
    if (r >= 0.7) return 'Muy bien. Repasá las que fallaste y vas de una.';
    if (r >= 0.5) return 'Vas por buen camino: reforzá los conceptos flojos.';
    return 'A repasar el resumen y volvé a intentarlo. ¡Se puede!';
  }
}
