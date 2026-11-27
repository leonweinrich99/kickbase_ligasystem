import { Link } from 'react-router-dom';
import ManagerRatingHex from './ui/ManagerRatingHex';
import { useManagerRatings } from './useManagerRatings';

// Kleiner Badge-Button auf der Account-Seite: nutzt dieselbe Mini-Badge-Optik
// (Metallic Prism v2 bzw. klassische Schildform) wie Liga-Tabelle und
// Manager-Detailseite. Fuehrt zur Vollbild-Route /account/manager-rating.
const ManagerRatingBadge = ({ kickbaseId }) => {
  const allRatings = useManagerRatings();
  const rating = kickbaseId && allRatings ? allRatings[kickbaseId] : null;

  if (!rating) return null;

  return (
    <Link
      to="/account/manager-rating"
      className="relative flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"
    >
      <ManagerRatingHex rating={rating} size={42} />
    </Link>
  );
};

export default ManagerRatingBadge;
