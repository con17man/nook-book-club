import type { Database } from "@/lib/database.types";

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Profile = Tables<"profiles">;
export type BookEvent = Tables<"events">;
export type Book = Tables<"books">;
export type Reservation = Tables<"reservations">;
export type EventStatus = Enums<"event_status">;
export type ReservationStatus = Enums<"reservation_status">;
