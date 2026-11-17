import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserPlus, Trash2, User, Edit } from 'lucide-react';
import { Doctor } from '../types';

export const DoctorList: React.FC = () => {
  const { doctors, addDoctor, updateDoctor, selectDoctor, selectedDoctorId, resetData } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', specialty: '', email: '' });
  
  // State for editing a doctor
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ firstName: '', lastName: '', specialty: '', email: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newDoctor: Doctor = {
      id: crypto.randomUUID(),
      ...formData
    };
    addDoctor(newDoctor);
    setFormData({ firstName: '', lastName: '', specialty: '', email: '' });
    setShowForm(false);
  };

  const startEdit = (e: React.MouseEvent, doc: Doctor) => {
    e.stopPropagation();
    setEditingDoctorId(doc.id);
    setEditFormData({
      firstName: doc.firstName,
      lastName: doc.lastName,
      specialty: doc.specialty,
      email: doc.email || ''
    });
  };

  const handleEditSubmit = (e: React.FormEvent, doctorId: string) => {
    e.preventDefault();
    updateDoctor(doctorId, editFormData);
    setEditingDoctorId(null);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Mis Médicos</h2>
          <p className="text-slate-500 mt-1">Administra tus clientes y selecciona uno para trabajar.</p>
        </div>
        <div className="flex gap-4">
            <button 
                onClick={resetData}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
                <Trash2 size={18} /> Borrar Todo
            </button>
            <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-md"
            >
            <UserPlus size={20} />
            Nuevo Médico
            </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-fade-in">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              required
              placeholder="Nombre"
              className="p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              value={formData.firstName}
              onChange={e => setFormData({...formData, firstName: e.target.value})}
            />
            <input
              required
              placeholder="Apellido"
              className="p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              value={formData.lastName}
              onChange={e => setFormData({...formData, lastName: e.target.value})}
            />
            <input
              required
              placeholder="Especialidad"
              className="p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              value={formData.specialty}
              onChange={e => setFormData({...formData, specialty: e.target.value})}
            />
            <input
              placeholder="Email"
              type="email"
              className="p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
            <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {doctors.map(doc => {
          const isEditing = editingDoctorId === doc.id;
          
          if (isEditing) {
            return (
              <div
                key={doc.id}
                onClick={(e) => e.stopPropagation()}
                className="p-6 rounded-xl border border-teal-500 bg-white shadow-md animate-fade-in flex flex-col justify-between"
              >
                <form onSubmit={(e) => handleEditSubmit(e, doc.id)} className="space-y-3 w-full">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-teal-600 uppercase tracking-wider">Editar Médico</span>
                    <button
                      type="button"
                      onClick={() => setEditingDoctorId(null)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      placeholder="Nombre"
                      className="p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none w-full bg-slate-50"
                      value={editFormData.firstName}
                      onChange={e => setEditFormData({...editFormData, firstName: e.target.value})}
                    />
                    <input
                      required
                      placeholder="Apellido"
                      className="p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none w-full bg-slate-50"
                      value={editFormData.lastName}
                      onChange={e => setEditFormData({...editFormData, lastName: e.target.value})}
                    />
                  </div>
                  <input
                    required
                    placeholder="Especialidad"
                    className="p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none w-full bg-slate-50"
                    value={editFormData.specialty}
                    onChange={e => setEditFormData({...editFormData, specialty: e.target.value})}
                  />
                  <input
                    placeholder="Email"
                    type="email"
                    className="p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none w-full bg-slate-50"
                    value={editFormData.email}
                    onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button 
                      type="submit" 
                      className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </div>
            );
          }

          return (
            <div
              key={doc.id}
              onClick={() => selectDoctor(doc.id)}
              className={`cursor-pointer p-6 rounded-xl border transition-all ${
                selectedDoctorId === doc.id
                  ? 'border-teal-500 bg-cyan-50 ring-2 ring-teal-200'
                  : 'border-slate-200 bg-white hover:border-teal-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="p-3 bg-teal-100 rounded-full text-teal-700">
                  <User size={24} />
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => startEdit(e, doc)}
                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-50 rounded-lg transition-colors"
                    title="Editar Médico"
                  >
                    <Edit size={16} />
                  </button>
                  {selectedDoctorId === doc.id && (
                    <span className="px-2 py-1 bg-teal-600 text-white text-xs font-bold rounded-full">ACTIVO</span>
                  )}
                </div>
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-900">{doc.firstName} {doc.lastName}</h3>
              <p className="text-slate-500 font-medium">{doc.specialty}</p>
              <p className="text-slate-400 text-sm mt-2">{doc.email || 'Sin email'}</p>
            </div>
          );
        })}
        {doctors.length === 0 && !showForm && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-300 rounded-xl">
                <p className="text-slate-400 text-lg">No hay médicos cargados. Comienza agregando uno.</p>
            </div>
        )}
      </div>
    </div>
  );
};