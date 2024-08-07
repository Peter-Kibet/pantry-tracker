import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  CircularProgress,
} from "@mui/material";
import { Cancel } from "@mui/icons-material";
import { useAlert } from "@/context";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const CameraComponent = ({ refreshItems }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true); // Added this line
  const { user } = useAuth();
  const alert = useAlert();

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setCameraSupported(true);
    } else {
      setCameraSupported(false);
      alert.error("Camera is not supported on this device or browser");
    }
  }, [alert]);

  const startCamera = () => {
    if (cameraSupported) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.error("Error accessing the camera: ", err);
          setCameraSupported(false);
          alert.error("Camera is not supported on this device or browser");
        });
    }
    setOpenModal(true);
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
    }
  };

  const takePhoto = () => {
    const context = canvasRef.current.getContext("2d");
    context.drawImage(
      videoRef.current,
      0,
      0,
      canvasRef.current.width,
      canvasRef.current.height
    );
    const photo = canvasRef.current.toDataURL("image/png");
    setImage(photo);
    stopCamera(); // Stop the camera after capturing the image
  };

  const handleCancel = () => {
    setOpenModal(false);
    setImage(null);
    stopCamera(); // Ensure the camera stops if the dialog is closed without capturing
  };

  const handleAdd = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/imageRecognition", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a pantry item predictor that can predict an item I am holding in my hand in the image. Return only the name of the item that I am holding in the image. If it is not a pantry item, then reply 'false' as an answer.",
            },
            {
              role: "user",
              content: {
                image_url: image,
              },
            },
          ],
        }),
        headers: {
          "Content-Type": "application/json",
          // Authorization header if needed, otherwise remove it
        },
      });

      const result = (await response.json()).data;
      if (result !== "false") {
        const pantryRef = collection(db, `users/${user.uid}/pantry`);
        const q = query(pantryRef, where("name", "==", result));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          await addDoc(pantryRef, {
            name: result,
            quantity: 1,
          });
          alert.success(`${result} added to your pantry list`);
        } else {
          const docRef = querySnapshot.docs[0].ref;
          await updateDoc(docRef, {
            quantity: querySnapshot.docs[0].data().quantity + 1,
          });
          alert.success(`${result} quantity updated in your pantry list`);
        }
        refreshItems();
      } else {
        alert.error(`This item can't be added to your pantry list`);
      }
    } catch (error) {
      console.error(error);
      alert.error(error);
    } finally {
      setOpenModal(false);
      setLoading(false);
      setImage(null);
    }
  };

  return (
    <Box className="flex flex-col items-center">
      <Button
        onClick={startCamera}
        variant="contained"
        color="primary"
        className="mt-4"
      >
        Open Camera
      </Button>

      <Dialog
        open={openModal}
        onClose={!loading ? handleCancel : undefined}
        disableBackdropClick={loading}
        disableEscapeKeyDown={loading}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Capture Image</DialogTitle>
        <DialogContent className="flex flex-col justify-center items-center">
          <Box
            className="relative w-full h-full"
            sx={{ width: "100%", height: "100%" }}
          >
            <video ref={videoRef} autoPlay style={{ width: "100%" }} />
            <canvas
              ref={canvasRef}
              style={{ display: "none" }}
              width="640"
              height="480"
            ></canvas>
          </Box>
          <Button
            onClick={takePhoto}
            variant="contained"
            color="secondary"
            className="mt-4"
          >
            Capture
          </Button>
          {image && (
            <img
              src={image}
              alt="Captured"
              style={{ width: "100%", marginTop: "10px" }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancel}
            disabled={loading}
            startIcon={<Cancel />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            variant="contained"
            color="primary"
            disabled={!image || loading}
            sx={{ backgroundColor: image ? "primary.main" : "grey.500" }}
          >
            {loading ? <CircularProgress size={24} /> : "Add"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CameraComponent;
