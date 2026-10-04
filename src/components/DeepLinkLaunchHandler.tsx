import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerLaunchQueueConsumer } from "@/lib/deepLinkLaunch";

/** Navega internamente a la URL con la que el sistema abrió la app instalada. */
const DeepLinkLaunchHandler = () => {
  const navigate = useNavigate();
  useEffect(() => {
    registerLaunchQueueConsumer((target) => navigate(target, { replace: true }));
  }, [navigate]);
  return null;
};

export default DeepLinkLaunchHandler;
