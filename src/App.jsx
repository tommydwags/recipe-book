import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  reload
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  deleteDoc,
  addDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  ChefHat, 
  X,
  Clock,
  Users,
  Utensils,
  BookOpen,
  Check,
  ShoppingCart,
  Search,
  PlusCircle,
  MinusCircle,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  Tag as TagIcon,
  Settings,
  Star,
  Calendar,
  ChevronRight,
  Sparkles,
  LogOut,
  ShieldCheck,
  Mail,
  RefreshCw,
  Lock,
  ArrowRight,
  UserCheck
} from 'lucide-react';

// --- CONSTANTS & CONFIG ---
const COOKING_UNITS = [
  "UNIT", "PIECE", "PINCH", "DASH", "TEASPOON", "TABLESPOON", "FL OZ", "CUP", "PINT", "QUART", "GALLON",
  "GRAM", "KG", "OZ", "LB", "ML", "LITER", "CLOVE", "STICK", "CAN", "PACKAGE", "SLICE", "HEAD", "BUNCH", 
  "SPRIG", "STALK", "LEAF", "BOX", "BAG", "JAR"
];

const INITIAL_TAGS = ["Breakfast", "Dessert", "Cocktails", "Mocktails", "Snacks", "Salads", "Soups", "Dinner"];

const BLANK_RECIPE = {
  title: "",
  description: "",
  prepTime: "15 min",
  cookTime: "30 min",
  servings: "2",
  tagIds: [],
  ingredients: [{ amount: "1", unit: "UNIT", name: "" }],
  instructions: [""]
};

// --- FIREBASE INITIALIZATION (DUAL-MODE) ---
const PORTABLE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAkdKmuMwku-nTtK4V_xGO_Wj0sjXkLw5M",
  authDomain: "recipe-book-planner.firebaseapp.com",
  projectId: "recipe-book-planner",
  storageBucket: "recipe-book-planner.firebasestorage.app",
  messagingSenderId: "641855928176",
  appId: "1:641855928176:web:23412a8fc09082b79b41b5"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : PORTABLE_FIREBASE_CONFIG;

const appId = typeof __app_id !== 'undefined' ? __app_id : "jess-tommy-recipe-book";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- UTILS ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callGemini = async (prompt, base64ImageData) => {
  const apiKey = ""; 
  let retries = 0;
  const maxRetries = 5;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/png", data: base64ImageData } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          prepTime: { type: "STRING" },
          cookTime: { type: "STRING" },
          servings: { type: "STRING" },
          tagNames: { type: "ARRAY", items: { type: "STRING" } },
          ingredients: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                amount: { type: "STRING" },
                unit: { type: "STRING" },
                name: { type: "STRING" }
              }
            }
          },
          instructions: { type: "ARRAY", items: { type: "STRING" } }
        }
      }
    }
  };

  while (retries <= maxRetries) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (e) {
      if (retries === maxRetries) throw e;
      const delay = Math.pow(2, retries) * 1000;
      await sleep(delay);
      retries++;
    }
  }
};

// --- COMPONENTS ---

const Modal = ({ children, title, onClose }) => {
  const handleContentClick = (e) => e.stopPropagation();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div 
        className="relative bg-white dark:bg-neutral-900 w-full max-w-4xl h-[92vh] sm:h-[85vh] sm:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden border-t sm:border border-neutral-200 dark:border-neutral-800 shadow-2xl"
        onClick={handleContentClick}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0 bg-white dark:bg-neutral-900 z-20">
          <h2 className="text-xl font-bold dark:text-white truncate">{title || 'Details'}</h2>
          <button type="button" onClick={onClose} className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:scale-110 active:scale-95 transition-all">
            <X size={20} className="dark:text-neutral-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 pb-32 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const AuthScreen = ({ user, verificationNeeded, onSignOut, onRefreshUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError("Google Login failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        setError("Verification email sent! Check your inbox.");
        setIsRegistering(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.includes('auth/user-not-found') ? "No account found." : 
                err.message.includes('auth/wrong-password') ? "Incorrect password." : err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const checkVerification = async () => {
    setChecking(true);
    try {
      await reload(auth.currentUser);
      onRefreshUser(); 
    } catch (e) {
      setError("Failed to refresh status.");
    } finally {
      setChecking(false);
    }
  };

  if (verificationNeeded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-orange-100 dark:bg-orange-950/30 text-orange-600 rounded-3xl flex items-center justify-center shadow-inner mx-auto mb-6">
              <Mail size={40} />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">Verify Your Email</h1>
            <p className="text-neutral-500 font-medium text-center">We sent a link to <span className="font-bold text-neutral-900 dark:text-white">{user?.email}</span>.</p>
          </div>
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] shadow-xl border border-neutral-100 dark:border-neutral-800 space-y-6">
            <button 
              onClick={checkVerification}
              disabled={checking}
              className="w-full bg-orange-600 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw size={20} />}
              I've verified it
            </button>
            <button 
              onClick={onSignOut}
              className="w-full text-center text-xs font-bold text-neutral-400 hover:text-red-500 transition-colors"
            >
              Log in with a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center text-white shadow-2xl rotate-6 mx-auto mb-6">
            <ChefHat size={40} />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-neutral-900 dark:text-white">Our Kitchen</h1>
          <p className="text-neutral-500 font-medium italic">"The secret ingredient is always love."</p>
        </div>

        <div className="bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] shadow-xl border border-neutral-100 dark:border-neutral-800 space-y-6">
          {error && (
            <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 ${error.includes('sent') ? 'bg-green-50 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600'}`}>
              <ShieldCheck size={18} /> {error}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-4">Email Address</label>
              <input 
                type="email" 
                required
                className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-transparent focus:border-orange-500 rounded-2xl p-4 text-sm font-bold outline-none transition-all shadow-inner"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-4">Password</label>
              <input 
                type="password" 
                required
                className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-transparent focus:border-orange-500 rounded-2xl p-4 text-sm font-bold outline-none transition-all shadow-inner"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button 
              disabled={authLoading}
              className="w-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-black py-4 rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest disabled:opacity-50"
            >
              {authLoading ? <Loader2 className="animate-spin" /> : (isRegistering ? 'Create Account' : 'Enter Kitchen')}
            </button>
          </form>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-100 dark:border-neutral-800"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-black text-neutral-400"><span className="bg-white dark:bg-neutral-900 px-4">Or use Google</span></div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-white font-black py-4 rounded-2xl flex items-center justify-center gap-4 text-sm uppercase tracking-widest hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all disabled:opacity-50"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>

          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="w-full text-center text-xs font-bold text-neutral-400 hover:text-orange-600 transition-colors pt-2"
          >
            {isRegistering ? "Already a chef? Log in" : "New here? Create your book"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [tags, setTags] = useState([]);
  const [plannedIds, setPlannedIds] = useState([]);
  const [expandedPlannedIds, setExpandedPlannedIds] = useState([]);
  const [mealPlanChecked, setMealPlanChecked] = useState({ ingredients: {}, instructions: {} });
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('library'); 
  
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view');
  
  const [selectedTagFilters, setSelectedTagFilters] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMsg, setStatusMsg] = useState(null);
  const [editData, setEditData] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [newTagName, setNewTagName] = useState("");

  const fileInputRef = useRef(null);

  // Verification helper
  const isVerified = useMemo(() => {
    if (!user) return false;
    const googleVerified = (user.providerData || []).some(p => p.providerId === 'google.com');
    return user.emailVerified || googleVerified;
  }, [user]);

  // --- Auth logic ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
          await signInWithCustomToken(auth, __initial_auth_token);
        } catch (e) {
          console.error("Token sign-in failed.");
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser ? { ...currentUser } : null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Sync ---
  useEffect(() => {
    if (!user || !isVerified) return;

    const recipesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'recipes');
    const tagsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tags');
    const planRef = doc(db, 'artifacts', appId, 'users', user.uid, 'mealPlan', 'current');

    const unsubRecipes = onSnapshot(recipesRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecipes(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (err) => console.error("Recipes Error:", err));

    const unsubTags = onSnapshot(tagsRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length === 0) {
        const batch = writeBatch(db);
        INITIAL_TAGS.forEach(t => {
          const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'tags'));
          batch.set(newDocRef, { name: t, createdAt: serverTimestamp() });
        });
        batch.commit();
      } else {
        setTags(list.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      }
    }, (err) => console.error("Tags Error:", err));

    const unsubPlan = onSnapshot(planRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPlannedIds(data.recipeIds || []);
        setMealPlanChecked({
          ingredients: data.checkedIngredients || {},
          instructions: data.checkedInstructions || {}
        });
      }
    }, (err) => console.error("Plan Error:", err));

    return () => { unsubRecipes(); unsubTags(); unsubPlan(); };
  }, [user?.uid, isVerified]);

  // --- UI Logic ---
  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast("Signed out");
    } catch (e) {
      showToast("Sign out failed", "error");
    }
  };

  const showToast = (text, type = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const togglePlanned = async (e, recipeId) => {
    if (e) e.stopPropagation();
    const planRef = doc(db, 'artifacts', appId, 'users', user.uid, 'mealPlan', 'current');
    const isAdding = !plannedIds.includes(recipeId);
    const newIds = isAdding 
      ? [...plannedIds, recipeId]
      : plannedIds.filter(id => id !== recipeId);
    
    await setDoc(planRef, { recipeIds: newIds }, { merge: true });
    if (isAdding) setExpandedPlannedIds(prev => [...new Set([...prev, recipeId])]);
    showToast(isAdding ? "Added to plan" : "Removed from plan");
  };

  const togglePlannerExpand = (recipeId) => {
    setExpandedPlannedIds(prev => 
      prev.includes(recipeId) ? prev.filter(id => id !== recipeId) : [...prev, recipeId]
    );
  };

  const updateMealCheck = async (type, recipeId, index) => {
    const planRef = doc(db, 'artifacts', appId, 'users', user.uid, 'mealPlan', 'current');
    const current = mealPlanChecked[type]?.[recipeId] || [];
    const updatedIndices = current.includes(index)
      ? current.filter(i => i !== index)
      : [...current, index];
    
    const updatePath = type === 'ingredients' ? 'checkedIngredients' : 'checkedInstructions';
    await setDoc(planRef, { [updatePath]: { ...(mealPlanChecked[type] || {}), [recipeId]: updatedIndices } }, { merge: true });
  };

  const exportMasterGroceryList = () => {
    const plannedRecipes = recipes.filter(r => plannedIds.includes(r.id));
    let masterList = "GROCERY LIST\n\n";

    plannedRecipes.forEach(recipe => {
      const checked = mealPlanChecked?.ingredients?.[recipe.id] || [];
      const ingredients = recipe.ingredients || [];
      const missing = ingredients.filter((_, idx) => !checked.includes(idx));
      
      if (missing.length > 0) {
        masterList += `${recipe.title.toUpperCase()}:\n`;
        missing.forEach(i => {
          if (typeof i === 'string') masterList += `- ${i}\n`;
          else masterList += `- ${i.amount || ''} ${i.unit || ''} ${i.name || ''}\n`;
        });
        masterList += "\n";
      }
    });

    if (masterList.trim() === "GROCERY LIST") {
      showToast("Everything is checked off!");
      return;
    }

    const el = document.createElement('textarea');
    el.value = masterList;
    document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    showToast("Master list copied to clipboard!");
  };

  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      const matchesTags = selectedTagFilters.length === 0 || 
                          selectedTagFilters.some(id => (r.tagIds || []).includes(id));
      const matchesSearch = (r.title || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (r.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTags && matchesSearch;
    });
  }, [recipes, selectedTagFilters, searchQuery]);

  const processImage = async (file) => {
    if (!file) return;
    setProcessing(true);
    showToast("Reading recipe photo...", "info");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result.split(',')[1];
        const prompt = `Read the recipe from this photo. Extract title, description, timings, servings, and instructions. Return JSON. Available tags: ${tags.map(t => t.name).join(", ")}.`;
        
        const extracted = await callGemini(prompt, base64Data);
        if (extracted) {
          const tagIds = (extracted.tagNames || [])
            .map(tn => tags.find(t => t.name.toLowerCase() === tn.toLowerCase())?.id)
            .filter(Boolean);
          
          const recipesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'recipes');
          await addDoc(recipesRef, { 
            ...extracted, 
            tagIds, 
            createdAt: serverTimestamp() 
          });
          showToast("Import successful!");
        }
      };
    } catch (error) { 
      showToast("Import failed", "error"); 
    } finally { 
      setProcessing(false); 
    }
  };

  const handleSaveRecipe = async (e) => {
    if (e) e.preventDefault();
    setProcessing(true);
    try {
      if (editData?.id) {
        const recipeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'recipes', editData.id);
        const { id, ...dataToSave } = editData;
        await updateDoc(recipeRef, dataToSave);
      } else if (editData) {
        const recipesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'recipes');
        await addDoc(recipesRef, { ...editData, createdAt: serverTimestamp() });
      }
      setIsModalOpen(false);
      showToast("Saved to Book");
    } catch (error) { showToast("Save failed", "error"); }
    finally { setProcessing(false); }
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;
    const tagsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tags');
    await addDoc(tagsRef, { name: newTagName.trim(), createdAt: serverTimestamp() });
    setNewTagName("");
  };

  const handleDragStart = (idx) => setDraggedIndex(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;
    const newList = [...(editData?.instructions || [])];
    const item = newList.splice(draggedIndex, 1)[0];
    newList.splice(idx, 0, item);
    setEditData({ ...editData, instructions: newList });
    setDraggedIndex(idx);
  };

  // --- RENDER ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="animate-spin text-orange-600" size={40} />
      </div>
    );
  }

  // Guard: Not Auth or Not Verified
  if (!user || !isVerified) {
    return (
      <AuthScreen 
        user={user} 
        verificationNeeded={!!user && !isVerified} 
        onSignOut={() => signOut(auth)} 
        onRefreshUser={() => setUser({ ...auth.currentUser })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 font-sans selection:bg-orange-100">
      
      {/* Navbar */}
      <header className="sticky top-0 z-40 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-3 self-start">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center text-white shadow-sm rotate-3">
              <ChefHat size={24} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight leading-none">Recipe Book</h1>
              <p className="text-[10px] uppercase font-black tracking-widest text-neutral-400 mt-1">{user?.email?.split('@')[0] || 'Chef'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input 
                type="text"
                placeholder="Search..."
                className="w-full bg-neutral-100 dark:bg-neutral-800 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              type="button"
              onClick={() => { setEditData({...BLANK_RECIPE}); setModalMode('edit'); setIsModalOpen(true); }}
              className="p-2.5 bg-neutral-800 dark:bg-white text-white dark:text-neutral-900 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-sm"
              title="New Recipe"
            >
              <Plus size={20} />
            </button>
            <button 
              type="button"
              onClick={() => { setModalMode('tags'); setIsModalOpen(true); }}
              className="p-2.5 bg-neutral-200 dark:bg-neutral-800 rounded-xl hover:bg-neutral-300 transition-colors"
              title="Tags"
            >
              <Settings size={20} />
            </button>
            <button 
              type="button"
              onClick={handleLogout}
              className="p-2.5 bg-neutral-200 dark:bg-neutral-800 rounded-xl text-neutral-500 hover:text-red-500 transition-colors"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 sticky top-[104px] md:top-[73px] z-30">
        <div className="max-w-7xl mx-auto flex gap-8">
          <button 
            onClick={() => setActiveTab('library')}
            className={`py-4 text-xs uppercase tracking-widest font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'library' ? 'border-orange-600 text-orange-600' : 'border-transparent text-neutral-400'}`}
          >
            <BookOpen size={16} /> Library
          </button>
          <button 
            onClick={() => setActiveTab('planner')}
            className={`py-4 text-xs uppercase tracking-widest font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'planner' ? 'border-orange-600 text-orange-600' : 'border-transparent text-neutral-400'}`}
          >
            <Calendar size={16} /> Meal Planner
            {plannedIds.length > 0 && <span className="bg-orange-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{plannedIds.length}</span>}
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6 min-h-[60vh]">
        <div className="mb-8 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 shrink-0">
            <button
              onClick={() => setSelectedTagFilters([])}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedTagFilters.length === 0 ? 'bg-neutral-800 dark:bg-white text-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`}
            >
              All
            </button>
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => setSelectedTagFilters(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${selectedTagFilters.includes(tag.id) ? 'bg-orange-600 text-white shadow-sm' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`}
              >
                {tag.name}
                {selectedTagFilters.includes(tag.id) && <X size={12} />}
              </button>
            ))}
          </div>

          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            className="flex items-center justify-center gap-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:border-orange-500 transition-all disabled:opacity-50 shadow-sm"
          >
            {processing ? <Loader2 className="animate-spin" size={16} /> : <ImageIcon size={16} />}
            Scan Recipe Photo
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => processImage(e.target.files[0])} />
          </button>
        </div>

        {activeTab === 'library' && (
          <div className="space-y-6">
            {filteredRecipes.length === 0 ? (
              <div className="text-center py-32 text-neutral-400">
                <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
                <p>No recipes found. Start by scanning a photo!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredRecipes.map((recipe) => (
                  <div 
                    key={recipe.id}
                    onClick={() => { setSelectedRecipe(recipe); setModalMode('view'); setIsModalOpen(true); }}
                    className="group bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 hover:border-orange-500 transition-all cursor-pointer flex flex-col shadow-sm relative"
                  >
                    <button 
                      onClick={(e) => togglePlanned(e, recipe.id)}
                      className={`absolute top-4 right-4 p-2.5 rounded-xl transition-all ${plannedIds.includes(recipe.id) ? 'bg-orange-600 text-white shadow-md' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 hover:bg-neutral-200'}`}
                    >
                      <Star size={18} fill={plannedIds.includes(recipe.id) ? "currentColor" : "none"} />
                    </button>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {(recipe.tagIds || []).slice(0, 2).map(tid => {
                        const tag = tags.find(t => t.id === tid);
                        return tag ? <span key={tid} className="text-[9px] font-black uppercase text-orange-600 px-2 py-0.5 bg-orange-50 dark:bg-orange-950/30 rounded">{tag.name}</span> : null;
                      })}
                    </div>
                    <h3 className="text-lg font-bold mb-2 pr-10 leading-tight">{recipe.title || 'Untitled Recipe'}</h3>
                    <p className="text-xs text-neutral-500 line-clamp-2 mb-6 italic flex-grow leading-relaxed">{recipe.description || 'No description provided.'}</p>
                    <div className="flex items-center gap-6 text-[10px] text-neutral-400 font-bold uppercase tracking-widest border-t border-neutral-50 dark:border-neutral-800 pt-5">
                      <div className="flex items-center gap-2"><Clock size={14} /> {recipe.cookTime || '-'}</div>
                      <div className="flex items-center gap-2"><Users size={14} /> {recipe.servings || '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'planner' && (
          <div className="space-y-10">
            {plannedIds.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-3xl text-neutral-400">
                <Calendar size={64} className="mx-auto mb-4 opacity-10" />
                <p className="font-bold">No meals planned yet.</p>
                <button onClick={() => setActiveTab('library')} className="mt-4 text-orange-600 font-bold text-sm uppercase tracking-widest">Go to Library</button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                  <h2 className="text-3xl font-bold flex items-center gap-4">
                    <Calendar className="text-orange-600" size={32} /> Planned Meals
                  </h2>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button onClick={exportMasterGroceryList} className="flex-1 sm:flex-none flex items-center justify-center gap-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-6 py-3 rounded-2xl font-bold text-sm shadow-xl">
                      <ShoppingCart size={20} /> Master Grocery List
                    </button>
                    <button 
                      onClick={async () => {
                        const planRef = doc(db, 'artifacts', appId, 'users', user.uid, 'mealPlan', 'current');
                        await setDoc(planRef, { recipeIds: [], checkedIngredients: {}, checkedInstructions: {} });
                        showToast("Plan cleared");
                      }}
                      className="p-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 rounded-2xl hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={24} />
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {recipes.filter(r => plannedIds.includes(r.id)).map(recipe => {
                    const isExpanded = expandedPlannedIds.includes(recipe.id);
                    const checkedIngredientsCount = (mealPlanChecked?.ingredients?.[recipe.id] || []).length;
                    const checkedInstructionsCount = (mealPlanChecked?.instructions?.[recipe.id] || []).length;
                    return (
                      <div key={recipe.id} className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                        <div onClick={() => togglePlannerExpand(recipe.id)} className="flex items-center justify-between p-8 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-all">
                          <div className="flex items-center gap-6">
                            <div className={`p-2 rounded-xl transition-transform duration-300 ${isExpanded ? 'rotate-90 text-orange-600 bg-orange-50' : 'text-neutral-400 bg-neutral-100'}`}><ChevronRight size={24} /></div>
                            <div>
                              <h3 className="text-xl font-bold">{recipe.title}</h3>
                              <div className="flex gap-6 mt-2">
                                <span className="text-[10px] uppercase font-black tracking-widest text-neutral-400">Ingredients: {checkedIngredientsCount}/{recipe.ingredients?.length || 0}</span>
                                <span className="text-[10px] uppercase font-black tracking-widest text-neutral-400">Steps: {checkedInstructionsCount}/{recipe.instructions?.length || 0}</span>
                              </div>
                            </div>
                          </div>
                          <button onClick={(e) => togglePlanned(e, recipe.id)} className="p-3 text-neutral-300 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                        </div>
                        {isExpanded && (
                          <div className="p-8 pt-0 border-t border-neutral-50 dark:border-neutral-800 grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="mt-8 space-y-6">
                              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-3"><Utensils size={16} className="text-orange-600" /> Need for this dish</h4>
                              <div className="space-y-3">
                                {recipe.ingredients?.map((ing, i) => {
                                  const isChecked = mealPlanChecked?.ingredients?.[recipe.id]?.includes(i);
                                  return (
                                    <label key={i} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${isChecked ? 'bg-neutral-50 dark:bg-neutral-800/20 opacity-30' : 'bg-white dark:bg-neutral-800 border-neutral-100 dark:border-neutral-700 shadow-sm hover:scale-[1.01]'}`}>
                                      <input type="checkbox" className="hidden" checked={isChecked || false} onChange={() => updateMealCheck('ingredients', recipe.id, i)} />
                                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${isChecked ? 'bg-neutral-800 border-neutral-800 text-white' : 'border-neutral-200 dark:border-neutral-600'}`}>
                                        {isChecked && <Check size={14} strokeWidth={4} />}
                                      </div>
                                      <div className={`text-sm font-medium ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-800 dark:text-white'}`}>
                                        {typeof ing === 'string' ? ing : (
                                          <><span className="font-bold text-orange-600 mr-2">{ing?.amount} <span className="text-[10px] uppercase">{ing?.unit}</span></span> {ing?.name}</>
                                        )}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="mt-8 space-y-6">
                              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-3"><ChefHat size={16} className="text-orange-600" /> Preparation</h4>
                              <div className="space-y-6">
                                {recipe.instructions?.map((step, i) => {
                                  const isChecked = mealPlanChecked?.instructions?.[recipe.id]?.includes(i);
                                  return (
                                    <div key={i} className="flex gap-5 group cursor-pointer" onClick={() => updateMealCheck('instructions', recipe.id, i)}>
                                      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all ${isChecked ? 'bg-green-100 text-green-600' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 group-hover:bg-neutral-800 group-hover:text-white transition-all shadow-sm'}`}>
                                        {isChecked ? <Check size={18} strokeWidth={3} /> : i + 1}
                                      </div>
                                      <p className={`text-sm pt-2 leading-relaxed ${isChecked ? 'line-through text-neutral-400 italic' : 'text-neutral-600 dark:text-neutral-300 font-medium'}`}>{step}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* --- Modals --- */}
      {isModalOpen && (
        <Modal 
          title={
            modalMode === 'edit' ? (editData?.id ? 'Edit Recipe' : 'New Recipe') : 
            modalMode === 'tags' ? 'Manage Categories' : 
            modalMode === 'delete' ? 'Delete Record' : (selectedRecipe?.title || 'Details')
          } 
          onClose={() => setIsModalOpen(false)}
        >
          {modalMode === 'view' && selectedRecipe && (
            <div className="space-y-12 pb-32">
              <div className="flex items-center justify-around p-8 bg-neutral-100 dark:bg-neutral-800 rounded-[2rem] shadow-inner">
                <div className="text-center"><p className="text-[10px] uppercase font-black tracking-widest text-neutral-400 mb-2">Prep</p><p className="font-bold text-lg">{selectedRecipe.prepTime || '-'}</p></div>
                <div className="text-center border-x border-neutral-200 dark:border-neutral-700 px-10"><p className="text-[10px] uppercase font-black tracking-widest text-neutral-400 mb-2">Cook</p><p className="font-bold text-lg">{selectedRecipe.cookTime || '-'}</p></div>
                <div className="text-center"><p className="text-[10px] uppercase font-black tracking-widest text-neutral-400 mb-2">Serves</p><p className="font-bold text-lg">{selectedRecipe.servings || '-'}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <section>
                  <h3 className="font-bold text-sm uppercase mb-6 tracking-[0.2em] flex items-center gap-3"><Utensils size={20} className="text-orange-600" /> Ingredients</h3>
                  <div className="space-y-3">
                    {(selectedRecipe.ingredients || []).map((ing, i) => (
                      <div key={i} className="p-4 bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl text-sm font-medium shadow-sm">
                        {typeof ing === 'string' ? ing : <><span className="font-bold text-orange-600 mr-2">{ing?.amount} <span className="text-[10px] uppercase tracking-tighter">{ing?.unit}</span></span> {ing?.name}</>}
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="font-bold text-sm uppercase mb-6 tracking-[0.2em] flex items-center gap-3"><ChefHat size={20} className="text-orange-600" /> Instructions</h3>
                  <div className="space-y-6">
                    {(selectedRecipe.instructions || []).map((step, i) => (
                      <div key={i} className="flex gap-5"><div className="shrink-0 w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center text-[10px] font-black">{i+1}</div><p className="text-sm pt-1 leading-relaxed text-neutral-600 dark:text-neutral-400 font-medium">{step}</p></div>
                    ))}
                  </div>
                </section>
              </div>
              <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-white dark:from-neutral-900 via-white dark:via-neutral-900 to-transparent flex gap-4 z-30">
                <button type="button" onClick={() => setModalMode('delete')} className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors shadow-sm"><Trash2 size={24} /></button>
                <button type="button" onClick={() => { setEditData({ ...selectedRecipe }); setModalMode('edit'); }} className="flex-1 bg-neutral-100 dark:bg-neutral-800 font-bold py-5 rounded-3xl flex items-center justify-center gap-3 text-xs uppercase tracking-widest hover:bg-neutral-200 transition-all shadow-sm">Edit</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-black py-5 rounded-3xl text-xs uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95">Close</button>
              </div>
            </div>
          )}

          {modalMode === 'edit' && editData && (
            <div className="space-y-12 pb-32">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2"><label className="text-xs font-black text-neutral-400 uppercase tracking-widest ml-2">Title</label><input type="text" className="w-full bg-neutral-50 dark:bg-neutral-800 border-2 border-transparent focus:border-orange-500 rounded-2xl p-4 font-bold outline-none transition-all shadow-inner" value={editData.title || ''} onChange={(e) => setEditData({...editData, title: e.target.value})} /></div>
                <div className="space-y-2"><label className="text-xs font-black text-neutral-400 uppercase tracking-widest ml-2">Tags</label><div className="flex flex-wrap gap-2 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-2xl min-h-[58px] shadow-inner">
                  {tags.map(tag => (<button key={tag.id} type="button" onClick={() => { const tagIds = editData.tagIds || []; const newTagIds = tagIds.includes(tag.id) ? tagIds.filter(id => id !== tag.id) : [...tagIds, tag.id]; setEditData({ ...editData, tagIds: newTagIds }); }} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${ (editData.tagIds || []).includes(tag.id) ? 'bg-orange-600 text-white shadow-md' : 'bg-white dark:bg-neutral-900 text-neutral-400 border border-neutral-100 dark:border-neutral-700' }`}>{tag.name}</button>))}
                </div></div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest ml-2">Description</label>
                <textarea 
                  className="w-full bg-neutral-50 dark:bg-neutral-800 rounded-2xl p-5 outline-none h-28 resize-none text-sm font-medium shadow-inner border-2 border-transparent focus:border-orange-500 transition-all" 
                  value={editData.description || ''} 
                  onChange={(e) => setEditData({...editData, description: e.target.value})} 
                  placeholder="Intro notes..."
                />
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2"><label className="text-xs font-black text-neutral-400 uppercase tracking-widest text-center block">Prep</label><input type="text" className="w-full bg-neutral-50 dark:bg-neutral-800 rounded-2xl p-4 text-center text-sm font-bold shadow-inner" value={editData.prepTime || ''} onChange={(e) => setEditData({...editData, prepTime: e.target.value})} /></div>
                <div className="space-y-2"><label className="text-xs font-black text-neutral-400 uppercase tracking-widest text-center block">Cook</label><input type="text" className="w-full bg-neutral-50 dark:bg-neutral-800 rounded-2xl p-4 text-center text-sm font-bold shadow-inner" value={editData.cookTime || ''} onChange={(e) => setEditData({...editData, cookTime: e.target.value})} /></div>
                <div className="space-y-2"><label className="text-xs font-black text-neutral-400 uppercase tracking-widest text-center block">Serves</label><input type="text" className="w-full bg-neutral-50 dark:bg-neutral-800 rounded-2xl p-4 text-center text-sm font-bold shadow-inner" value={editData.servings || ''} onChange={(e) => setEditData({...editData, servings: e.target.value})} /></div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between ml-2"><h4 className="text-xs font-black uppercase text-neutral-400 tracking-widest">Ingredients</h4><button type="button" onClick={() => setEditData({...editData, ingredients: [...(editData.ingredients || []), {amount: "1", unit: "UNIT", name: ""}]})} className="w-10 h-10 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg"><Plus size={20} /></button></div>
                <div className="space-y-3">{(editData.ingredients || []).map((ing, i) => (
                    <div key={i} className="grid grid-cols-12 gap-3 items-center bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-2xl transition-all border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700">
                      <div className="col-span-2"><input type="text" className="w-full bg-white dark:bg-neutral-900 rounded-xl p-3 text-xs text-center font-black outline-none focus:ring-2 focus:ring-orange-500 shadow-sm" value={typeof ing === 'string' ? '' : (ing?.amount || '')} onChange={(e) => { const newIng = [...editData.ingredients]; if (typeof newIng[i] === 'string') newIng[i] = { amount: e.target.value, unit: 'UNIT', name: newIng[i] }; else newIng[i].amount = e.target.value; setEditData({...editData, ingredients: newIng}); }} /></div>
                      <div className="col-span-3"><select className="w-full bg-white dark:bg-neutral-900 rounded-xl p-3 text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-orange-500 shadow-sm appearance-none text-center" value={typeof ing === 'string' ? 'UNIT' : (ing?.unit || 'UNIT').toUpperCase()} onChange={(e) => { const newIng = [...editData.ingredients]; if (typeof newIng[i] === 'string') newIng[i] = { amount: '', unit: e.target.value, name: newIng[i] }; else newIng[i].unit = e.target.value; setEditData({...editData, ingredients: newIng}); }}> {COOKING_UNITS.map(u => <option key={u} value={u}>{u}</option>)} </select></div>
                      <div className="col-span-6"><input type="text" className="w-full bg-white dark:bg-neutral-900 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 shadow-sm" value={typeof ing === 'string' ? ing : (ing?.name || '')} onChange={(e) => { const newIng = [...editData.ingredients]; if (typeof newIng[i] === 'string') newIng[i] = e.target.value; else newIng[i].name = e.target.value; setEditData({...editData, ingredients: newIng}); }} /></div>
                      <div className="col-span-1 text-right"><button type="button" onClick={() => setEditData({...editData, ingredients: editData.ingredients.filter((_, idx) => idx !== i)})} className="p-2 text-neutral-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button></div>
                    </div>
                  ))}</div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between ml-2">
                  <h4 className="text-xs font-black uppercase text-neutral-400 tracking-widest">Instructions</h4>
                  <button type="button" onClick={() => setEditData({...editData, instructions: [...(editData.instructions || []), ""]})} className="w-10 h-10 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg"><Plus size={20} /></button>
                </div>
                <div className="space-y-4">
                  {(editData.instructions || []).map((step, i) => (
                    <div 
                      key={i} 
                      draggable 
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDragEnd={() => setDraggedIndex(null)}
                      className={`flex gap-4 items-start bg-neutral-50 dark:bg-neutral-800 p-5 rounded-3xl border border-transparent transition-all group ${draggedIndex === i ? 'opacity-20 scale-95 border-dashed border-orange-500' : 'hover:border-neutral-200 shadow-sm'}`}
                    >
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-white dark:bg-neutral-900 flex items-center justify-center text-xs font-black text-neutral-400 cursor-grab active:cursor-grabbing shadow-sm">
                        <GripVertical size={18} />
                      </div>
                      <div className="flex-1 space-y-3">
                        <textarea className="w-full bg-transparent border-none p-0 text-sm font-medium resize-none min-h-[80px] outline-none placeholder:opacity-20" value={step} placeholder={`Step ${i+1}`} onChange={(e) => {
                            const newSteps = [...editData.instructions];
                            newSteps[i] = e.target.value;
                            setEditData({...editData, instructions: newSteps});
                        }} />
                      </div>
                      <button type="button" onClick={() => setEditData({...editData, instructions: editData.instructions.filter((_, idx) => idx !== i)})} className="text-neutral-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><MinusCircle size={24} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-white dark:from-neutral-900 via-white dark:via-neutral-900 to-transparent flex gap-4 z-30">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 font-bold bg-neutral-100 dark:bg-neutral-800 rounded-3xl text-xs uppercase tracking-widest transition-all">Discard</button>
                <button 
                  type="button" 
                  onClick={handleSaveRecipe} 
                  disabled={processing} 
                  className="flex-[2] bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-black py-5 rounded-3xl shadow-2xl flex justify-center items-center gap-3 text-xs uppercase tracking-widest"
                >
                  {processing ? <Loader2 className="animate-spin" size={22} /> : <><Sparkles size={20} /> Save Recipe</>}
                </button>
              </div>
            </div>
          )}

          {modalMode === 'tags' && (
            <div className="space-y-10">
              <div className="space-y-4 p-8 bg-neutral-50 dark:bg-neutral-800 rounded-[2.5rem] shadow-inner"><label className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] ml-2">Add New Tag</label><div className="flex gap-3"><input type="text" placeholder="e.g. Ski Comfort" className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl px-5 py-4 text-sm font-bold outline-none shadow-sm focus:ring-2 focus:ring-orange-500 transition-all" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} /><button onClick={addTag} className="bg-orange-600 text-white px-8 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">Add</button></div></div>
              <div className="space-y-4"> {tags.map(tag => ( <div key={tag.id} className="flex items-center justify-between p-5 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-700 shadow-sm transition-all hover:border-orange-500"> <span className="font-bold text-sm flex items-center gap-4"><TagIcon size={18} className="text-orange-600" /> {tag.name}</span> <button onClick={async () => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tags', tag.id))} className="p-2 text-neutral-300 hover:text-red-600 transition-colors"><Trash2 size={20} /></button> </div> ))} </div>
              <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-white dark:from-neutral-900 via-white dark:via-neutral-900 to-transparent flex gap-3 z-30"><button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-black py-5 rounded-3xl text-xs uppercase tracking-[0.2em] shadow-xl">Close</button></div>
            </div>
          )}

          {modalMode === 'delete' && selectedRecipe && (
            <div className="text-center py-20 space-y-12">
              <div className="w-24 h-24 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl animate-pulse"><Trash2 size={48} /></div>
              <p className="text-neutral-500 font-bold uppercase text-[10px] tracking-[0.2em]">Delete permanently:<br/><span className="text-neutral-900 dark:text-white italic text-lg font-normal">"{selectedRecipe.title}"</span></p>
              <div className="flex gap-4 max-w-sm mx-auto px-6"><button type="button" onClick={() => setModalMode('view')} className="flex-1 py-4 font-black bg-neutral-100 dark:bg-neutral-800 rounded-3xl text-[10px] uppercase tracking-widest shadow-sm">Cancel</button><button type="button" onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recipes', selectedRecipe.id)); setIsModalOpen(false); showToast("Deleted"); }} className="flex-1 py-4 font-black bg-red-600 text-white rounded-3xl hover:bg-red-700 shadow-2xl transition-all text-[10px] uppercase tracking-widest">Delete</button></div>
            </div>
          )}
        </Modal>
      )}

      {/* Persistence Toast */}
      {statusMsg && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className={`px-10 py-5 rounded-[2.5rem] shadow-2xl flex items-center gap-5 border border-white/10 dark:border-black/10 ${ statusMsg.type === 'error' ? 'bg-red-600 text-white' : statusMsg.type === 'info' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900' }`}> {statusMsg.type === 'error' ? <X size={20} strokeWidth={3} /> : (processing ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} strokeWidth={3} />)} <span className="font-black text-xs uppercase tracking-[0.2em]">{statusMsg.text}</span> </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
        @media print { header, .bg-white.dark\\:bg-neutral-900, button, .fixed.bottom-0 { display: none !important; } body { background: white !important; color: black !important; padding: 0 !important; } .max-w-4xl { max-width: 100% !important; margin: 0 !important; border: none !important; } }
        body:has(.fixed.inset-0) { overflow: hidden; overscroll-behavior: none; }
      `}} />
    </div>
  );
}