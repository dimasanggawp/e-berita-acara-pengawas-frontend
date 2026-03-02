import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import QRScanner from './components/QRScanner';
import SignaturePad from './components/SignaturePad';

const API_BASE = '/api';

function App() {
  const [initData, setInitData] = useState({ pengawas: [], ujians: [] });
  const [activeTab, setActiveTab] = useState('scan-peserta');
  const [scannedStudents, setScannedStudents] = useState([]);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [proctorPresensi, setProctorPresensi] = useState(null);
  const [showLoginScanner, setShowLoginScanner] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [authLoading, setAuthLoading] = useState(!!localStorage.getItem('pengawas_token'));

  // Set axios default auth header from saved token
  useEffect(() => {
    const token = localStorage.getItem('pengawas_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token & restore session
      axios.get(`${API_BASE}/pengawas-auth/me`)
        .then(res => {
          setUser(res.data.user);
          setProctorPresensi(res.data.presensi);
          setIsLoggedIn(true);
          setFormData(prev => ({ ...prev, pengawas_id: res.data.user.id }));
        })
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem('pengawas_token');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => setAuthLoading(false));
    }
  }, []);

  const fetchPresensi = () => {
    axios.get(`${API_BASE}/presensi-today`)
      .then(res => setScannedStudents(res.data))
      .catch(err => console.error("Error fetching presensi:", err.message, err.response?.data));
  };

  const handleLogin = useCallback(async (niy) => {
    console.log("handleLogin called with NIY:", JSON.stringify(niy));
    if (!niy || !niy.trim()) {
      Swal.fire('Format Tidak Sesuai', 'QR Code tidak berisi NIY yang valid. Pastikan QR Code berisi angka NIY.', 'error');
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/login-niy`, { niy: niy.trim() });
      // Save Sanctum token
      const token = res.data.token;
      localStorage.setItem('pengawas_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setUser(res.data.user);
      setProctorPresensi(res.data.presensi);
      setShowLoginScanner(false);
      setShowScanner(false);
      setIsLoggedIn(true);
      setShowWelcome(true);
      setFormData(prev => ({ ...prev, pengawas_id: res.data.user.id }));
    } catch (err) {
      console.error("Login error:", err.response?.data);
      Swal.fire('Login Gagal', err.response?.data?.message || "Terjadi kesalahan saat verifikasi QR Code", 'error');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await axios.post(`${API_BASE}/pengawas-auth/logout`);
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      localStorage.removeItem('pengawas_token');
      delete axios.defaults.headers.common['Authorization'];
      setIsLoggedIn(false);
      setUser(null);
      setProctorPresensi(null);
      setFormData(prev => ({ ...prev, pengawas_id: '' }));
    }
  }, []);

  // ... rest of state ...
  const [formData, setFormData] = useState({
    ujian_id: '',
    sesi: '',
    pengawas_id: '',
    mapel_id: '',
    mata_pelajaran_display: '',
    kelas: '',
    kelas_id: '',
    mulai_ujian: '',
    ujian_berakhir: '',
    total_expected: '',
    total_present: '',
    total_absent: '',
    absent_details: '',
    notes: ''
  });
  const [availableSesi, setAvailableSesi] = useState([]);
  const [sigCanvas, setSigCanvas] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    console.log("Fetching init-data from:", `${API_BASE}/init-data`);
    axios.get(`${API_BASE}/init-data`)
      .then(res => {
        console.log("Initial data loaded successfully:", res.data);
        setInitData(res.data);

        // Auto-select the first available active Ujian if not already set
        if (res.data.ujians && res.data.ujians.length > 0) {
          setFormData(prev => ({ ...prev, ujian_id: res.data.ujians[0].id }));
        }

        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load initial data:", err.message, err.response?.data);
        Swal.fire({
          title: 'Gagal Memuat Data',
          text: `Gagal memuat data dari backend (${err.message}). Pastikan server Laravel berjalan di 127.0.0.1:8000`,
          icon: 'error',
          confirmButtonColor: '#4f46e5'
        });
        setLoading(false);
      });

    fetchPresensi();
  }, []);

  useEffect(() => {
    if (formData.ujian_id && formData.pengawas_id) {
      axios.get(`${API_BASE}/get-assignment`, {
        params: {
          ujian_id: formData.ujian_id,
          pengawas_id: formData.pengawas_id,
          sesi: formData.sesi
        }
      })
        .then(res => {
          const { jadwal, peserta, available_sesi } = res.data;
          setAvailableSesi(available_sesi || []);
          setFormData(prev => ({
            ...prev,
            mapel_id: jadwal.mapel_id,
            mata_pelajarans: jadwal.mata_pelajarans || [],
            mata_pelajaran_display: jadwal.mata_pelajaran,
            kelas: jadwal.kelas,
            ruangan: jadwal.ruangan || '',
            kelas_id: jadwal.kelas_id,
            mulai_ujian: jadwal.mulai_ujian,
            ujian_berakhir: jadwal.ujian_berakhir,
            total_expected: jadwal.total_siswa.toString()
          }));
          setAssignedStudents(peserta);
          // Recalculate absent if needed
          const absent = jadwal.total_siswa - (parseInt(formData.total_present) || 0);
          setFormData(prev => ({ ...prev, total_absent: absent >= 0 ? absent : 0 }));
        })
        .catch(err => {
          console.error("Assignment not found", err);
          setAssignedStudents([]);
          setAvailableSesi([]);
          // Optionally reset fields if not found
          setFormData(prev => ({
            ...prev,
            mapel_id: '',
            mata_pelajarans: [],
            mata_pelajaran_display: '',
            kelas: '',
            ruangan: '',
            kelas_id: '',
            mulai_ujian: '',
            ujian_berakhir: '',
            total_expected: ''
          }));
        });
    }
  }, [formData.ujian_id, formData.pengawas_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ujian_id') {
      setFormData(prev => ({ ...prev, ujian_id: value, sesi: '' }));
    } else if (name === 'mapel_id') {
      // Find the selected mapel object to get the actual mapel_id
      const selectedJadwal = formData.mata_pelajarans?.find(m => m.id.toString() === value.toString());
      setFormData(prev => ({
        ...prev,
        [name]: value, // This is actually the jadwal_id for the select value
        actual_mapel_id: selectedJadwal ? selectedJadwal.mapel_id : ''
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const isProcessingScan = useRef(false);

  const handleScan = useCallback(async (decodedText) => {
    if (isProcessingScan.current) return;
    isProcessingScan.current = true;

    console.log("=== QR SCAN RESULT ===", JSON.stringify(decodedText), "length:", decodedText?.length);
    if (showLoginScanner) {
      handleLogin(decodedText);
      return;
    }

    if (activeTab === 'berita-acara') {
      // Logic for room scanning removed as rooms are no longer used.
      Swal.fire('Mode Pemindaian Salah', `Fitur ini untuk scan peserta. Ter-scan: ${decodedText}.`, 'info');
    } else {
      // Scan Peserta logic with Backend
      try {
        const response = await axios.post(`${API_BASE}/scan-peserta`, {
          kode_peserta: decodedText,
          ujian_id: formData.ujian_id,
          pengawas_id: formData.pengawas_id
        });

        // Handle Dual-Mode Feedback
        if (response.data.type === 'pengawas') {
          setProctorPresensi(response.data.presensi);
        }

        Swal.fire({
          title: 'Berhasil!',
          text: response.data.message,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
        fetchPresensi(); // Refresh list
      } catch (error) {
        Swal.fire({
          title: 'Scan Gagal',
          text: error.response?.data?.message || "Gagal melakukan scan peserta",
          icon: 'warning',
          timer: 2500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end'
        });
      }
    }
    setShowScanner(false);

    // Allow next scan after a cooldown
    setTimeout(() => {
      isProcessingScan.current = false;
    }, 1500);
  }, [showLoginScanner, activeTab, formData.ujian_id, handleLogin]);

  useEffect(() => {
    if (assignedStudents.length > 0) {
      // Hitung berapa banyak siswa di assignedStudents yang sudah ada di scannedStudents (presensi)
      const presentStudents = assignedStudents.filter(s =>
        scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta)
      );
      const absentStudents = assignedStudents.filter(s =>
        !scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta)
      );

      setFormData(prev => ({
        ...prev,
        total_present: presentStudents.length.toString(),
        total_absent: absentStudents.length.toString(),
        absent_details: absentStudents.map(s => s.nama).join(', ')
      }));
    }
  }, [assignedStudents, scannedStudents]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sigCanvas || sigCanvas.isEmpty()) {
      Swal.fire('Tanda Tangan Diperlukan', 'Silakan isi tanda tangan pengawas sebelum menyimpan laporan.', 'warning');
      return;
    }

    setSubmitting(true);

    const sigBlob = await new Promise(resolve => sigCanvas.getCanvas().toBlob(resolve, 'image/png'));

    const data = new FormData();
    Object.keys(formData).forEach(key => {
      // If we are appending mapel_id, use the actual_mapel_id instead if it exists
      if (key === 'mapel_id' && formData.actual_mapel_id) {
        data.append(key, formData.actual_mapel_id);
      } else if (key !== 'actual_mapel_id' && key !== 'mata_pelajarans' && key !== 'mata_pelajaran_display') {
        data.append(key, formData[key]);
      }
    });
    data.append('signature', sigBlob, 'signature.png');

    try {
      await axios.post(`${API_BASE}/submit-report`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      Swal.fire('Terkirim!', 'Berita Acara berhasil dikirim', 'success').then(() => {
        window.location.reload();
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Gagal Menyimpan', 'Gagal mengirim data: ' + (error.response?.data?.message || error.message), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 bg-indigo-200 rounded-full mb-4"></div>
        <div className="h-4 bg-slate-200 rounded w-48"></div>
      </div>
    </div>
  );

  if (!isLoggedIn) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-8 space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-25 animate-pulse"></div>
            <img src="/logo.webp" alt="Logo SMK" className="relative h-32 w-auto drop-shadow-md" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              E-Berita Acara
            </h1>
            <p className="text-slate-500 font-medium">SMK Kartanegara Wates</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl p-6 sm:p-8 text-center space-y-6 border border-indigo-100 shadow-inner">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 bg-indigo-200 rounded-3xl rotate-6 opacity-30"></div>
            <div className="relative w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-sm text-indigo-600 border border-indigo-50">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-base text-indigo-900 font-bold">Autentikasi Pengawas</p>
            <p className="text-xs text-slate-500 px-4 leading-relaxed">Dekatkan QR Code pada kartu identitas Anda ke arah kamera untuk masuk ke sistem.</p>
          </div>
          <button
            onClick={() => {
              setShowLoginScanner(true);
              setShowScanner(true);
            }}
            className="group relative w-full overflow-hidden rounded-2xl bg-indigo-600 p-4 transition-all hover:bg-indigo-700 active:scale-[0.98]"
          >
            <div className="relative flex items-center justify-center space-x-3 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 transition-transform group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </div>
              <span className="text-lg font-bold tracking-wide">Scan ID Card Pengawas</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full transition-transform duration-1000 group-hover:translate-x-full"></div>
          </button>
        </div>

        {showScanner && <QRScanner onScan={handleScan} onClose={() => { setShowScanner(false); setShowLoginScanner(false); }} />}
      </div>
    </div>
  );

  if (showWelcome) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-8 space-y-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900">Selamat Datang!</h2>
            <p className="text-slate-500 font-medium">{user?.name}</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">NIY</span>
            <span className="text-slate-900 font-mono font-bold">{user?.niy}</span>
          </div>
          <div className="h-px bg-slate-200"></div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Waktu Presensi</span>
            <span className="text-emerald-600 font-bold italic">
              {proctorPresensi?.waktu_datang ? new Date(proctorPresensi.waktu_datang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'} WIB
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowWelcome(false)}
          className="group relative w-full overflow-hidden rounded-2xl bg-indigo-600 p-4 transition-all hover:bg-indigo-700 active:scale-[0.98] shadow-lg shadow-indigo-200"
        >
          <span className="relative text-white font-bold text-lg flex items-center justify-center">
            Lanjut ke Berita Acara
            <svg className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
          </span>
        </button>
      </div>
    </div>
  );

  // Computed properties for the scanning tab
  const presentInRoom = assignedStudents.filter(s =>
    scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta)
  ).map(s => {
    const scanData = scannedStudents.find(sc => sc.kode_peserta === s.nomor_peserta);
    return {
      ...s,
      waktu_datang: scanData?.waktu_datang,
      waktu_pulang: scanData?.waktu_pulang
    };
  });

  const absentInRoom = assignedStudents.filter(s =>
    !scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta)
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-6">
          <div className="flex items-center space-x-4">
            <img src="/logo.webp" alt="Logo SMK" className="h-16 w-auto" />
            <div className="text-left">
              <h1 className="text-xl font-black text-slate-900 leading-tight">Berita Acara Ujian</h1>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">SMK Kartanegara Wates</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-slate-50 pl-4 pr-2 py-2 rounded-2xl border border-slate-100">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Pengawas Aktif</p>
              <p className="text-sm font-bold text-slate-800 leading-none mb-1">{user.name}</p>
              {proctorPresensi && (
                <div className="flex space-x-1 justify-end">
                  <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded flex items-center">
                    <span className="mr-0.5">D:</span> {new Date(proctorPresensi.waktu_datang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {proctorPresensi.waktu_pulang && (
                    <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center">
                      <span className="mr-0.5">P:</span> {new Date(proctorPresensi.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-200 p-1 rounded-xl max-w-md mx-auto shadow-inner">
          <button
            onClick={() => setActiveTab('scan-peserta')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'scan-peserta'
              ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            Scan Peserta
          </button>
          <button
            onClick={() => setActiveTab('berita-acara')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'berita-acara'
              ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            Berita Acara
          </button>
        </div>

        {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

        {(() => {
          const presentInRoom = assignedStudents.filter(s =>
            scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta)
          ).map(s => {
            const scanData = scannedStudents.find(sc => sc.kode_peserta === s.nomor_peserta);
            return {
              ...s,
              waktu_datang: scanData?.waktu_datang,
              waktu_pulang: scanData?.waktu_pulang
            };
          }).sort((a, b) => new Date(b.waktu_datang) - new Date(a.waktu_datang));

          const absentInRoom = assignedStudents.filter(s =>
            !scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta)
          );

          return activeTab === 'scan-peserta' ? (
            <div className="space-y-6">
              <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-100 p-8 text-center space-y-6">

                <div className="max-w-md mx-auto space-y-2 mb-6 text-left">
                  <label className="block text-sm font-bold text-slate-700">Pilih Ujian Aktif</label>
                  <select
                    name="ujian_id"
                    value={formData.ujian_id}
                    onChange={handleChange}
                    className="block w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-3 text-base font-medium"
                    required
                  >
                    <option value="">-- Silakan Pilih Ujian --</option>
                    {initData.ujians?.map(u => (
                      <option key={u.id} value={u.id}>{u.nama_ujian}</option>
                    ))}
                  </select>

                  {availableSesi.length > 0 && (
                    <div className="pt-2">
                      <label className="block text-sm font-bold text-slate-700">Pilih Sesi</label>
                      <select
                        name="sesi"
                        value={formData.sesi}
                        onChange={handleChange}
                        className="block w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-3 text-base font-medium"
                      >
                        <option value="">-- Semua Sesi --</option>
                        {availableSesi.map(s => (
                          <option key={s} value={s}>Sesi {s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {formData.ujian_id ? (
                  <>
                    <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600 mb-2">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Scan QR Peserta</h2>
                    <p className="text-slate-600 max-w-sm mx-auto">Gunakan kamera untuk memindai kartu peserta ujian. Data akan otomatis masuk ke daftar sementara di bawah ini.</p>

                    <button
                      onClick={() => setShowScanner(true)}
                      className="inline-flex items-center justify-center px-10 py-4 bg-slate-800 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-slate-700 transition active:scale-95 mt-4"
                    >
                      Mulai Scan Peserta
                    </button>
                  </>
                ) : (
                  <div className="py-8 bg-amber-50 rounded-xl border border-amber-100 flex flex-col items-center">
                    <svg className="w-12 h-12 text-amber-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-amber-800 font-medium">Pilih jadwal ujian di atas terlebih dahulu untuk memunculkan daftar peserta.</p>
                  </div>
                )}
              </div>

              {formData.ujian_id && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Tabel Sudah Hadir */}
                  <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-100 flex flex-col">
                    <div className="bg-emerald-50 p-4 border-b border-emerald-100 flex justify-between items-center px-6">
                      <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        Siswa Hadir ({presentInRoom.length})
                      </h3>
                    </div>

                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0">
                          <tr className="border-b border-slate-100">
                            <th className="p-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-tight">Peserta</th>
                            <th className="p-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-tight">Waktu Datang</th>
                            <th className="p-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-tight">Waktu Pulang</th>
                          </tr>
                        </thead>
                        <tbody>
                          {presentInRoom.length > 0 ? presentInRoom.map((s, idx) => (
                            <tr key={idx} className="border-b border-emerald-50/50 last:border-0 hover:bg-emerald-50/30 transition-colors">
                              <td className="p-4 px-6 flex flex-col gap-1 w-full">
                                <div className="font-bold text-slate-800 text-sm">{s.nama}</div>
                                <div className="flex items-center gap-2">
                                  <div className="font-mono font-medium text-emerald-600 text-[10px] uppercase tracking-widest">{s.nomor_peserta}</div>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">{s.kelas}</span>
                                  {s.sesi && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">Sesi {s.sesi}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 px-6 text-slate-600 font-medium text-sm">
                                {s.waktu_datang ? new Date(s.waktu_datang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </td>
                              <td className="p-4 px-6 text-slate-600 font-medium text-sm">
                                {s.waktu_pulang ? new Date(s.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : (
                                  <span className="text-slate-400 italic text-[10px] px-2 py-1 bg-slate-100 rounded-md">Belum Pulang</span>
                                )}
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="3" className="p-10 text-center text-slate-400 italic text-sm">Belum ada peserta yang hadir.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tabel Belum Hadir */}
                  <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-100 flex flex-col">
                    <div className="bg-amber-50 p-4 border-b border-amber-100 flex justify-between items-center px-6">
                      <h3 className="font-bold text-amber-800 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Belum Hadir ({absentInRoom.length})
                      </h3>
                    </div>

                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0">
                          <tr className="border-b border-slate-100">
                            <th className="p-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-tight">Peserta</th>
                            <th className="p-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-tight text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absentInRoom.length > 0 ? absentInRoom.map((s, idx) => (
                            <tr key={idx} className="border-b border-amber-50/50 last:border-0 hover:bg-amber-50/30 transition-colors">
                              <td className="p-4 px-6 flex flex-col gap-1 w-full">
                                <div className="font-bold text-slate-800 text-sm">{s.nama}</div>
                                <div className="flex items-center gap-2">
                                  <div className="font-mono font-medium text-amber-600 text-[10px] uppercase tracking-widest">{s.nomor_peserta}</div>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">{s.kelas}</span>
                                  {s.sesi && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">Sesi {s.sesi}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 px-6 text-right">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black bg-amber-100/50 text-amber-600 uppercase tracking-widest">
                                  Belum Scan
                                </span>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="2" className="p-10 text-center text-slate-400 italic text-sm">Semua peserta telah hadir! 🎉</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-100">
              <div className="bg-slate-50/50 p-6 sm:p-8 border-b border-slate-100 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 1. Nama Ujian */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Nama Ujian</label>
                    <select
                      name="ujian_id"
                      value={formData.ujian_id}
                      onChange={handleChange}
                      className="block w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-3 text-base"
                      required
                    >
                      <option value="">-- Pilih Ujian --</option>
                      {initData.ujians?.map(u => (
                        <option key={u.id} value={u.id}>{u.nama_ujian}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Nama Pengawas (Read-only from Login) */}
                  <div className="space-y-2 text-left">
                    <label className="block text-sm font-semibold text-slate-700">Nama Pengawas</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={user?.name || ''}
                        readOnly
                        className="block w-full rounded-xl border-indigo-100 bg-indigo-50/50 py-3 px-4 text-base font-bold text-indigo-900 cursor-not-allowed shadow-inner"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* 3. Mata Pelajaran (Dropdown) */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Mata Pelajaran</label>
                    {formData.mata_pelajarans && formData.mata_pelajarans.length > 0 ? (
                      <select
                        name="mapel_id"
                        value={formData.mapel_id || ''}
                        onChange={handleChange}
                        className="block w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-3 text-base"
                        required
                      >
                        {formData.mata_pelajarans.map(m => (
                          <option key={m.id} value={m.id}>{m.nama}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={formData.mata_pelajaran_display || ''}
                          readOnly
                          placeholder="Auto-fill..."
                          className="block w-full rounded-xl border-indigo-100 bg-indigo-50/30 shadow-sm py-3 text-base text-indigo-900 font-medium"
                        />
                        <input type="hidden" name="mapel_id" value={formData.mapel_id || ''} />
                      </>
                    )}
                  </div>

                  {/* 4. Ruangan (Auto-filled) */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Ruangan</label>
                    <input
                      type="text"
                      name="ruangan"
                      value={formData.ruangan || ''}
                      readOnly
                      placeholder="Auto-fill..."
                      className="block w-full rounded-xl border-indigo-100 bg-indigo-50/30 shadow-sm py-3 text-base text-indigo-900 font-medium"
                      required
                    />
                    <input type="hidden" name="kelas_id" value={formData.kelas_id || ''} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  {/* 6. Mulai Ujian (Auto-filled) */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Mulai Ujian</label>
                    <input
                      type="text"
                      value={formData.mulai_ujian ? new Date(formData.mulai_ujian).toLocaleString('id-ID') : ''}
                      readOnly
                      className="block w-full rounded-xl border-indigo-100 bg-indigo-50/30 shadow-sm py-3 text-base text-indigo-900 font-medium"
                      required
                    />
                    <input type="hidden" name="mulai_ujian" value={formData.mulai_ujian || ''} />
                  </div>

                  {/* 7. Ujian Berakhir (Auto-filled) */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">Ujian Berakhir</label>
                    <input
                      type="text"
                      value={formData.ujian_berakhir ? new Date(formData.ujian_berakhir).toLocaleString('id-ID') : ''}
                      readOnly
                      className="block w-full rounded-xl border-indigo-100 bg-indigo-50/30 shadow-sm py-3 text-base text-indigo-900 font-medium"
                      required
                    />
                    <input type="hidden" name="ujian_berakhir" value={formData.ujian_berakhir || ''} />
                  </div>


                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-8">
                {/* Supervised Students List */}
                {assignedStudents.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 p-4 border-b border-slate-200">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Daftar Peserta Ujian Ini</h3>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b border-slate-100">
                            <th className="p-3 px-6 text-xs font-semibold text-slate-500 uppercase">Nama Peserta</th>
                            <th className="p-3 px-6 text-xs font-semibold text-slate-500 uppercase">Nomor Peserta</th>
                            <th className="p-3 px-6 text-xs font-semibold text-slate-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignedStudents.map((s, idx) => {
                            const isPresent = scannedStudents.some(sc => sc.kode_peserta === s.nomor_peserta);
                            return (
                              <tr key={idx} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${isPresent ? 'bg-emerald-50/40' : ''}`}>
                                <td className="p-3 px-6 text-sm font-medium text-slate-700">{s.nama}</td>
                                <td className="p-3 px-6 text-sm font-mono text-indigo-600 font-bold">{s.nomor_peserta}</td>
                                <td className="p-3 px-6">
                                  {isPresent ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                                      Hadir
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400">
                                      Belum Scan
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Attendance Stats */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Data Kehadiran Peserta</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Seharusnya Hadir</label>
                      <input
                        type="number"
                        name="total_expected"
                        value={formData.total_expected}
                        onChange={handleChange}
                        className="w-full text-2xl font-bold text-slate-900 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="0"
                        readOnly
                      />
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-indigo-600 text-[8px] text-white px-1.5 py-0.5 font-bold uppercase tracking-tighter">Auto-Sync</div>
                      <label className="block text-xs font-semibold text-indigo-600 mb-1">Hadir (Ter-scan)</label>
                      <input
                        type="number"
                        name="total_present"
                        value={formData.total_present}
                        readOnly
                        className="w-full text-2xl font-bold text-indigo-700 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="0"
                        required
                      />
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <label className="block text-xs font-semibold text-red-500 mb-1">Tidak Hadir</label>
                      <input
                        type="number"
                        name="total_absent"
                        value={formData.total_absent}
                        readOnly
                        className="w-full text-2xl font-bold text-red-600 border-none p-0 focus:ring-0 bg-transparent"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Details & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Catatan Peserta Tidak Hadir
                      <span className="text-xs font-normal text-slate-500 ml-1">(Otomatis dari Sistem)</span>
                    </label>
                    <textarea
                      name="absent_details"
                      value={formData.absent_details}
                      readOnly
                      className="block w-full rounded-xl border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-4 text-sm min-h-[120px] text-slate-600 font-medium"
                      placeholder="Semua peserta hadir."
                    ></textarea>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Catatan Kejadian</label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      className="block w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-4 text-sm min-h-[120px]"
                      placeholder="Catatan selama pelaksanaan ujian..."
                    ></textarea>
                  </div>
                </div>

                {/* Signature Area */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Tanda Tangan Pengawas</label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50 hover:bg-white transition-colors">
                    <SignaturePad setSignatureData={setSigCanvas} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-100/50 px-6 py-4 sm:px-8 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`
                      inline-flex items-center justify-center px-10 py-4 border border-transparent text-lg font-bold rounded-xl text-white shadow-xl transition-all active:scale-95
                      ${submitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900'}
                    `}
                >
                  {submitting ? 'Sedang Mengirim...' : 'Simpan Laporan'}
                </button>
              </div>
            </form>
          );
        })()}

        <div className="text-center text-slate-400 text-sm pb-8">
          &copy; {new Date().getFullYear()} SMK Kartanegara Wates. Built with React & Laravel.
        </div>
      </div>
    </div>
  );
}

export default App;

