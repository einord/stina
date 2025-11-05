interface ToastApi {
  success(message: string): void;
  error(message: string): void;
}

export const useToast = (): ToastApi => {
  const notify = (message: string, type: "success" | "error") => {
    if (window.Notification && Notification.permission === "granted") {
      new Notification(type === "success" ? "Klart" : "Fel", { body: message });
    } else if (window.Notification && Notification.permission !== "denied") {
      Notification.requestPermission();
    } else {
      // eslint-disable-next-line no-alert
      alert(message);
    }
  };

  return {
    success: (message: string) => notify(message, "success"),
    error: (message: string) => notify(message, "error")
  };
};
