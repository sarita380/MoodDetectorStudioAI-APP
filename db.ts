import { collection, doc, setDoc, getDocs, query, where, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Recording } from "../types";

/**
 * Saves a new emotional vocal recording session to Firestore recordings collection.
 */
export async function saveRecording(recording: Omit<Recording, "id">): Promise<Recording> {
  const recordingCollection = collection(db, "recordings");
  const newDocRef = doc(recordingCollection);
  const docId = newDocRef.id;

  // Build the strict payload matching the validation schema
  const payload: Recording = {
    userId: recording.userId,
    timestamp: recording.timestamp,
    vibe: recording.vibe,
    vibeScore: Number(recording.vibeScore),
    summary: recording.summary,
    transcript: recording.transcript
  };

  try {
    await setDoc(newDocRef, payload);
    return {
      id: docId,
      ...payload
    };
  } catch (error) {
    return handleFirestoreError(error, OperationType.CREATE, `recordings/${docId}`);
  }
}

/**
 * Fetches all past vocal emotional recording profiles for a specific authenticated user.
 */
export async function fetchRecordings(userId: string): Promise<Recording[]> {
  const path = "recordings";
  try {
    const q = query(
      collection(db, path),
      where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);
    const list: Recording[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({
        id: doc.id,
        userId: data.userId,
        timestamp: data.timestamp,
        vibe: data.vibe,
        vibeScore: data.vibeScore,
        summary: data.summary,
        transcript: data.transcript,
      });
    });

    // Client-side sort to preserve responsiveness and completely bypass composite index requirements in Firestore dev modes
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    return handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Deletes a recording session from the Firestore database.
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  const path = `recordings/${recordingId}`;
  try {
    const docRef = doc(db, "recordings", recordingId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
