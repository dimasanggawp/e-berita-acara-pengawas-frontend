import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const QRScanner = ({ onScan, onClose }) => {
    const scannerRef = useRef(null);

    useEffect(() => {
        const scannerId = "reader";
        if (!document.getElementById(scannerId)) return;

        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = { fps: 10 };

        html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                // Ensure it only triggers once
                if (html5QrCode.isScanning) {
                    html5QrCode.stop().then(() => {
                        onScan(decodedText);
                    }).catch(err => {
                        console.error("Failed to stop scanner", err);
                        onScan(decodedText);
                    });
                }
            }
        ).catch(err => {
            console.error("Unable to start scanning.", err);
        });

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current.clear();
                }).catch(err => console.error("Failed to stop scanner", err));
            }
        };
    }, [onScan]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const html5QrCode = new Html5Qrcode("reader");
        html5QrCode.scanFile(file, true)
            .then(decodedText => {
                onScan(decodedText);
            })
            .catch(err => {
                console.error("Error scanning file", err);
                alert("Gagal membaca QR Code dari file. Pastikan gambar jelas.");
            });
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center px-6">
                    <h3 className="font-bold text-slate-800 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                        Scan QR Code
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-900 shadow-inner">
                        <div id="reader" className="w-full h-full"></div>
                        {/* Scanning Overlay Effect */}
                        <div className="absolute inset-0 border-2 border-indigo-500/30 pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-indigo-500 rounded-2xl">
                                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-indigo-400 rounded-tl-md"></div>
                                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-indigo-400 rounded-tr-md"></div>
                                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-indigo-400 rounded-bl-md"></div>
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-indigo-400 rounded-br-md"></div>
                            </div>
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan-line"></div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <input
                            type="file"
                            id="qr-upload"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <button
                            onClick={() => document.getElementById('qr-upload').click()}
                            className="w-full py-3 bg-indigo-50 text-indigo-700 font-bold rounded-xl border-2 border-indigo-100 hover:bg-indigo-100 transition flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                            Pilih Gambar QR dari File
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 transition active:scale-[0.98]"
                        >
                            Tutup Kamera
                        </button>
                    </div>

                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                        <div className="flex">
                            <svg className="h-5 w-5 text-amber-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
                            <div className="text-left text-xs text-amber-800 space-y-1">
                                <p className="font-bold">Tips:</p>
                                <ul className="list-disc pl-4 space-y-0.5 opacity-80">
                                    <li>Gunakan tombol di atas jika kamera tidak berfungsi.</li>
                                    <li>Pastikan gambar QR Code terlihat jelas dan tidak buram.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QRScanner;
