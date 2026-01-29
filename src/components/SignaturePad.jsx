import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePad = ({ setSignatureData }) => {
    const sigCanvas = useRef({});

    const clear = () => {
        sigCanvas.current.clear();
        setSignatureData(null);
    };

    const save = () => {
        // Return the canvas so parent can extract Blob
        if (!sigCanvas.current.isEmpty()) {
            setSignatureData(sigCanvas.current);
        }
    };

    return (
        <div className="border border-gray-300 rounded p-2">
            <SignatureCanvas
                ref={sigCanvas}
                penColor="black"
                canvasProps={{ className: 'signatureCanvas w-full h-40 bg-gray-50' }}
                onEnd={save}
            />
            <button
                type="button"
                onClick={clear}
                className="mt-2 text-sm text-red-600 underline"
            >
                Clear Signature
            </button>
        </div>
    );
};

export default SignaturePad;
