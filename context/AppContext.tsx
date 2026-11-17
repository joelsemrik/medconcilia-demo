import React, { createContext, useContext, useState, useEffect, ReactNode, PropsWithChildren } from 'react';
import { Doctor, Consultation, Liquidation } from '../types';
import { normalizeText } from '../utils/excelParser';
import { initAuth, googleSignIn, googleLogout } from '../utils/googleAuth';
import { User } from 'firebase/auth';

interface AppState {
  doctors: Doctor[];
  consultations: Consultation[];
  liquidations: Liquidation[];
  selectedDoctorId: string | null;
  user: User | null;
  googleToken: string | null;
  isGoogleLoading: boolean;
}

interface AppContextType extends AppState {
  addDoctor: (doctor: Doctor) => void;
  updateDoctor: (id: string, updatedFields: Partial<Omit<Doctor, 'id'>>) => void;
  selectDoctor: (id: string) => void;
  addConsultations: (data: Consultation[]) => void;
  addLiquidations: (data: Liquidation[]) => void;
  reconcileData: () => void;
  resetData: () => void;
  clearDoctorData: (type: 'consultations' | 'liquidations', doctorId: string) => void;
  deleteConsultation: (id: string) => void;
  deleteLiquidation: (id: string) => void;
  deleteParticularLiquidations: (doctorId: string) => void;
  manualReconciliation: (consultationId: string, liquidationId: string) => void;
  manualReconciliationSolo: (consultationId: string, isReconciled: boolean, liquidationId?: string) => void;
  signInWithGoogle: () => Promise<void>;
  signOutFromGoogle: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: PropsWithChildren<{}>) => {
  const [doctors, setDoctors] = useState<Doctor[]>(() => {
    const saved = localStorage.getItem('doctors');
    return saved ? JSON.parse(saved) : [];
  });

  const [consultations, setConsultations] = useState<Consultation[]>(() => {
    const saved = localStorage.getItem('consultations');
    return saved ? JSON.parse(saved) : [];
  });

  const [liquidations, setLiquidations] = useState<Liquidation[]>(() => {
    const saved = localStorage.getItem('liquidations');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);

  // Google Auth states
  const [user, setUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(true);

  // Persistence
  useEffect(() => { localStorage.setItem('doctors', JSON.stringify(doctors)); }, [doctors]);
  useEffect(() => { localStorage.setItem('consultations', JSON.stringify(consultations)); }, [consultations]);
  useEffect(() => { localStorage.setItem('liquidations', JSON.stringify(liquidations)); }, [liquidations]);

  // Auth Initialization on Mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setGoogleToken(token);
        setIsGoogleLoading(false);
      },
      () => {
        setUser(null);
        setGoogleToken(null);
        setIsGoogleLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setGoogleToken(result.accessToken);
      }
    } catch (error) {
      console.error("Failed to sign in with Google:", error);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const signOutFromGoogle = async () => {
    setIsGoogleLoading(true);
    try {
      await googleLogout();
      setUser(null);
      setGoogleToken(null);
    } catch (error) {
      console.error("Failed to log out:", error);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const addDoctor = (doctor: Doctor) => {
    setDoctors(prev => [...prev, doctor]);
    if (!selectedDoctorId) setSelectedDoctorId(doctor.id);
  };

  const updateDoctor = (id: string, updatedFields: Partial<Omit<Doctor, 'id'>>) => {
    setDoctors(prev => prev.map(doc => doc.id === id ? { ...doc, ...updatedFields } : doc));
  };

  const selectDoctor = (id: string) => setSelectedDoctorId(id);

  const addConsultations = (data: Consultation[]) => {
    setConsultations(prev => [...prev, ...data]);
  };

  const addLiquidations = (data: Liquidation[]) => {
    setLiquidations(prev => [...prev, ...data]);
  };

  const reconcileData = () => {
    if (!selectedDoctorId) return;

    // Create copies and reset existing matches for the current doctor to ensure a fresh, consistent run
    const newConsultations = consultations.map(c => 
      c.doctorId === selectedDoctorId 
        ? { ...c, isReconciled: false, liquidationId: undefined, amount: undefined } 
        : c
    );
    const newLiquidations = liquidations.map(l => 
      l.doctorId === selectedDoctorId 
        ? { ...l, isMatched: false, consultationId: undefined } 
        : l
    );

    // Filter for current doctor only
    const docConsultations = newConsultations.filter(c => c.doctorId === selectedDoctorId);
    const docLiquidations = newLiquidations.filter(l => l.doctorId === selectedDoctorId);

    docConsultations.forEach(consult => {
      // Find a match in liquidations
      // Matching criteria: Same normalized Patient Name AND Same normalized Insurance
      // Optional: Date checking (Liquidation date usually >= Consultation date)
      const matchIndex = docLiquidations.findIndex(liq => {
         const nameMatch = normalizeText(liq.patientName) === normalizeText(consult.patientName);
         const insMatch = normalizeText(liq.insurance).includes(normalizeText(consult.insurance)) || normalizeText(consult.insurance).includes(normalizeText(liq.insurance));
         return nameMatch && insMatch && !liq.isMatched;
      });

      if (matchIndex !== -1) {
        const matchedLiq = docLiquidations[matchIndex];
        
        // Update both records
        consult.isReconciled = true;
        consult.liquidationId = matchedLiq.id;
        consult.amount = matchedLiq.netAmount; // Update consultation amount with actual net

        matchedLiq.isMatched = true;
        matchedLiq.consultationId = consult.id;

        // Note: Do not remove from docLiquidations since we check !liq.isMatched inside the findIndex
      }
    });

    // Update global state
    setConsultations(newConsultations);
    setLiquidations(newLiquidations);
  };

  const clearDoctorData = (type: 'consultations' | 'liquidations', doctorId: string) => {
    if (type === 'consultations') {
      // Delete consultations
      setConsultations(prev => prev.filter(c => c.doctorId !== doctorId));
      
      // Reset liquidations that were matched to these consultations
      setLiquidations(prev => prev.map(l => {
         if (l.doctorId === doctorId) {
             return { ...l, isMatched: false, consultationId: undefined };
         }
         return l;
      }));
    } else {
      // Delete liquidations
      setLiquidations(prev => prev.filter(l => l.doctorId !== doctorId));
      
      // Reset consultations that were matched to these liquidations
      setConsultations(prev => prev.map(c => {
          if (c.doctorId === doctorId) {
              return { ...c, isReconciled: false, liquidationId: undefined, amount: undefined };
          }
          return c;
      }));
    }
  };

  const deleteConsultation = (id: string) => {
    const item = consultations.find(c => c.id === id);
    if (item && item.isReconciled && item.liquidationId) {
      const liqId = item.liquidationId;
      setLiquidations(prev => prev.map(l => l.id === liqId ? { ...l, isMatched: false, consultationId: undefined } : l));
    }
    setConsultations(prev => prev.filter(c => c.id !== id));
  };

  const deleteLiquidation = (id: string) => {
    const item = liquidations.find(l => l.id === id);
    if (item && item.isMatched && item.consultationId) {
      const consId = item.consultationId;
      setConsultations(prev => prev.map(c => c.id === consId ? { ...c, isReconciled: false, liquidationId: undefined, amount: undefined } : c));
    }
    setLiquidations(prev => prev.filter(l => l.id !== id));
  };

  const deleteParticularLiquidations = (doctorId: string) => {
    const particularLiqs = liquidations.filter(l => 
      l.doctorId === doctorId && 
      normalizeText(l.insurance) === normalizeText('Particular')
    );
    const particularIds = new Set(particularLiqs.map(l => l.id));

    if (particularIds.size > 0) {
      const matchedConsultationIds = particularLiqs
        .filter(l => l.isMatched && l.consultationId)
        .map(l => l.consultationId!);

      if (matchedConsultationIds.length > 0) {
        setConsultations(prev => prev.map(c => 
          matchedConsultationIds.includes(c.id) 
            ? { ...c, isReconciled: false, liquidationId: undefined, amount: undefined } 
            : c
        ));
      }

      setLiquidations(prev => prev.filter(l => !particularIds.has(l.id)));
    }
  };

  const manualReconciliation = (consultationId: string, liquidationId: string) => {
    const targetLiq = liquidations.find(l => l.id === liquidationId);
    if (!targetLiq) return;

    setConsultations(prev => prev.map(c => {
      // If this is the chosen consultation, match it
      if (c.id === consultationId) {
        return { ...c, isReconciled: true, liquidationId: targetLiq.id, amount: targetLiq.netAmount };
      }
      // If other consultation was linked to the chosen liquidation, unlink it
      if (c.liquidationId === liquidationId) {
        return { ...c, isReconciled: false, liquidationId: undefined, amount: undefined };
      }
      return c;
    }));

    setLiquidations(prev => prev.map(l => {
      // If this is the chosen liquidation, match it
      if (l.id === liquidationId) {
        return { ...l, isMatched: true, consultationId: consultationId };
      }
      // If other liquidation was linked to the chosen consultation, unlink it
      if (l.consultationId === consultationId) {
        return { ...l, isMatched: false, consultationId: undefined };
      }
      return l;
    }));
  };

  const manualReconciliationSolo = (consultationId: string, isReconciled: boolean, liquidationId?: string) => {
    if (isReconciled && liquidationId) {
      manualReconciliation(consultationId, liquidationId);
      return;
    }

    setConsultations(prev => prev.map(c => {
      if (c.id === consultationId) {
        return { 
          ...c, 
          isReconciled, 
          liquidationId: isReconciled ? c.liquidationId : undefined, 
          amount: isReconciled ? c.amount : undefined 
        };
      }
      return c;
    }));

    if (!isReconciled) {
      setLiquidations(prev => prev.map(l => {
        if (l.consultationId === consultationId) {
          return { ...l, isMatched: false, consultationId: undefined };
        }
        return l;
      }));
    }
  };

  const resetData = () => {
    if(confirm("Are you sure you want to clear all data?")) {
        setDoctors([]);
        setConsultations([]);
        setLiquidations([]);
        setSelectedDoctorId(null);
        localStorage.clear();
    }
  }

  return (
    <AppContext.Provider value={{
      doctors,
      consultations,
      liquidations,
      selectedDoctorId,
      user,
      googleToken,
      isGoogleLoading,
      addDoctor,
      updateDoctor,
      selectDoctor,
      addConsultations,
      addLiquidations,
      reconcileData,
      resetData,
      clearDoctorData,
      deleteConsultation,
      deleteLiquidation,
      deleteParticularLiquidations,
      manualReconciliation,
      manualReconciliationSolo,
      signInWithGoogle,
      signOutFromGoogle
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};