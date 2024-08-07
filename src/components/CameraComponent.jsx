import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  CircularProgress,
  TextField,
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
  const { user } = useAuth();
  const alert = useAlert();
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.error("Error accessing the camera: ", err);
          alert.error("Camera is not supported on this device or browser");
        });
    } else {
      alert.error("Camera is not supported on this device or browser");
    }
  }, [alert]);

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
  };

  const handleCancel = () => {
    setOpenModal(false);
    setImage(null);
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
              content: [
                {
                  type: "text",
                  text: "You are a pantry item predictor that can predict an item I am holding in my hand in the image. Return only the name of the item that I am holding in the image. If it is not a pantry item, then reply 'false' as an answer.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: image,
                  },
                },
              ],
            },
          ],
        }),
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
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
      setApiKey("");
    }
  };

  const handleOpenModal = () => {
    setOpenModal(true);
  };

  return (
    <Box className="flex flex-col items-center">
      <Button
        onClick={handleOpenModal}
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
            <>
              <img
                src={image}
                alt="Captured"
                style={{ width: "100%", marginTop: "10px" }}
              />
              <TextField
                required
                label="Enter Your OpenAI API Key"
                variant="outlined"
                className="mt-10"
                onChange={(e) => {
                  setApiKey(e.target.value);
                }}
              />
            </>
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
          {image && (
            <Button
              type="submit"
              onClick={handleAdd}
              variant="contained"
              color="primary"
              disabled={loading || !apiKey}
            >
              {loading ? <CircularProgress size={24} /> : "Add"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CameraComponent;
