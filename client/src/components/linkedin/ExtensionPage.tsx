import { Download, Puzzle, Settings, Upload, CheckCircle2 } from 'lucide-react';

export default function ExtensionPage() {
    return (
        <div className="max-w-4xl mx-auto h-full overflow-y-auto pb-24 md:pb-12 px-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Area */}
            <div className="bg-white rounded-3xl p-5 md:p-8 mb-6 md:mb-8 shadow-sm border border-purple-100 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-50 rounded-full blur-3xl -mr-10 -mt-20 opacity-50 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-50 rounded-full blur-3xl -ml-10 -mb-10 opacity-50 pointer-events-none" />

                <div className="relative z-10 flex-1">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <Puzzle size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600">
                                Message Optimizer para WhatsApp
                            </h2>
                            <p className="text-slate-500 font-medium">Deenex Comercial — Extensión de Chrome</p>
                        </div>
                    </div>
                    <p className="text-slate-600 leading-relaxed max-w-xl">
                        Descarga e instala nuestra extensión oficial que inyecta un botón mágico (✨) directamente en tu WhatsApp Web. Optimiza tus mensajes antes de enviarlos: corrige gramática, ortografía y mejora tu tono con Inteligencia Artificial.
                    </p>
                </div>

                <div className="relative z-10 shrink-0">
                    <a
                        href="/extension.zip"
                        download="deenex-chrome-extension.zip"
                        className="group flex items-center gap-3 px-6 py-4 rounded-2xl font-bold text-white transition-all transform hover:-translate-y-1 hover:shadow-xl"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                            boxShadow: '0 8px 25px rgba(124, 58, 237, 0.3)',
                        }}
                    >
                        <div className="bg-white/20 p-2 rounded-xl group-hover:scale-110 transition-transform">
                            <Download size={20} />
                        </div>
                        Descargar Extensión (.zip)
                    </a>
                </div>
            </div>

            {/* Instruction Steps */}
            <div className="mb-4 flex items-center gap-2 px-2">
                <h3 className="text-lg font-bold text-slate-800">Guía de Instalación Rápida</h3>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-medium">4 simples pasos</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">

                {/* Step 1 */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-blue-200 transition-colors">
                    <div className="absolute top-6 right-6 text-slate-100 font-black text-6xl pointer-events-none group-hover:text-blue-50 transition-colors">1</div>
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 relative z-10">
                        <Download size={20} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2 relative z-10">Descargar y Descomprimir</h4>
                    <p className="text-sm text-slate-600 relative z-10 mb-4">
                        Hacé clic en el botón de arriba para descargar el archivo <code className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded">.zip</code>. Una vez descargado, buscalo en tu computadora, hacé clic derecho y seleccioná <strong>"Extraer aquí"</strong> (o "Unzip").
                    </p>
                </div>

                {/* Step 2 */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-purple-200 transition-colors">
                    <div className="absolute top-6 right-6 text-slate-100 font-black text-6xl pointer-events-none group-hover:text-purple-50 transition-colors">2</div>
                    <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4 relative z-10">
                        <Puzzle size={20} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2 relative z-10">Abrir Extensiones</h4>
                    <p className="text-sm text-slate-600 relative z-10 mb-4">
                        En el navegador Google Chrome, abrí una pestaña nueva, copiá y pegá la siguiente dirección en la barra y apretá Enter:
                    </p>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between relative z-10">
                        <code className="text-sm text-slate-700 font-mono">chrome://extensions/</code>
                        <button
                            onClick={() => navigator.clipboard.writeText('chrome://extensions/')}
                            className="text-xs font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            Copiar
                        </button>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-amber-200 transition-colors">
                    <div className="absolute top-6 right-6 text-slate-100 font-black text-6xl pointer-events-none group-hover:text-amber-50 transition-colors">3</div>
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 relative z-10">
                        <Settings size={20} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2 relative z-10">Modo Desarrollador</h4>
                    <p className="text-sm text-slate-600 relative z-10 mb-4">
                        En la esquina superior derecha de la página de extensiones, vas a ver un botón que dice <strong>"Modo desarrollador"</strong> (Developer mode). Asegurate de que esté <span className="text-amber-600 font-bold">activado</span>.
                    </p>
                </div>

                {/* Step 4 */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-emerald-200 transition-colors">
                    <div className="absolute top-6 right-6 text-slate-100 font-black text-6xl pointer-events-none group-hover:text-emerald-50 transition-colors">4</div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 relative z-10">
                        <Upload size={20} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 mb-2 relative z-10">Cargar Descomprimida</h4>
                    <p className="text-sm text-slate-600 relative z-10 mb-4">
                        Hacé clic en el botón <strong>"Cargar descomprimida"</strong> (Load unpacked) que apareció arriba a la izquierda. Seleccioná la carpeta de la extensión que extrajiste en el Paso 1.
                    </p>
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold bg-emerald-50 p-2.5 rounded-xl">
                        <CheckCircle2 size={16} />
                        ¡Listo! La extensión ya funciona.
                    </div>
                </div>

            </div>
        </div>
    );
}
