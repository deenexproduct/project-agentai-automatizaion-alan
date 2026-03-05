import { useState, useEffect } from 'react';
import { getOpsContacts } from '../../services/ops.service';
import { Users, Mail, Phone, Search, Building2 } from 'lucide-react';

interface OpsContact {
    _id: string;
    fullName: string;
    email?: string;
    phone?: string;
    position?: string;
    profilePhotoUrl?: string;
    company?: { _id: string; name: string; logo?: string; sector?: string };
    companies?: { _id: string; name: string; logo?: string; sector?: string }[];
}

export default function OpsContactList() {
    const [contacts, setContacts] = useState<OpsContact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadContacts();
    }, []);

    const loadContacts = async () => {
        setIsLoading(true);
        try {
            const data = await getOpsContacts();
            setContacts(data);
        } catch (error) {
            console.error('Failed to load ops contacts:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filtered = contacts.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return c.fullName?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.company?.name?.toLowerCase().includes(q) ||
            c.position?.toLowerCase().includes(q);
    });

    return (
        <div className="space-y-4 py-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Contactos de Operaciones</h2>
                    <p className="text-sm text-slate-500">{contacts.length} contactos de empresas con proyectos activos</p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar contacto..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none w-full transition-all"
                    />
                </div>
            </div>

            {/* Loading */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin"></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                        {contacts.length === 0
                            ? 'No hay contactos en operaciones todavía'
                            : 'No se encontraron resultados'}
                    </p>
                    {contacts.length === 0 && (
                        <p className="text-sm text-slate-400 mt-1">
                            Los contactos aparecen cuando sus empresas tienen deals en el pipeline operativo
                        </p>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                        {filtered.map((contact) => (
                            <div
                                key={contact._id}
                                className="p-4 hover:bg-sky-50/50 transition-colors flex items-center gap-4"
                            >
                                {/* Avatar */}
                                {contact.profilePhotoUrl ? (
                                    <img
                                        src={contact.profilePhotoUrl}
                                        alt={contact.fullName}
                                        className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-sm"
                                    />
                                ) : (
                                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center shadow-inner border border-white">
                                        <span className="text-sky-700 font-bold">
                                            {contact.fullName?.charAt(0)?.toUpperCase() || '?'}
                                        </span>
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{contact.fullName}</p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        {contact.position && (
                                            <span className="text-xs text-slate-500 truncate">{contact.position}</span>
                                        )}
                                        {contact.company && (
                                            <span className="inline-flex items-center gap-1 text-xs text-sky-600">
                                                <Building2 className="w-3 h-3" />
                                                {contact.company.name}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {contact.phone && (
                                        <a
                                            href={`tel:${contact.phone}`}
                                            className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                                            title={contact.phone}
                                        >
                                            <Phone className="w-4 h-4" />
                                        </a>
                                    )}
                                    {contact.email && (
                                        <a
                                            href={`mailto:${contact.email}`}
                                            className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                                            title={contact.email}
                                        >
                                            <Mail className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
