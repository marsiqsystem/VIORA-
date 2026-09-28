"use server";

import { wixClientServer } from "./wixClientServer";

export type UpdateUserState = { ok?: boolean; error?: string };

/**
 * Update the logged-in member's name and phone. Only the member's own record can
 * be changed (the id comes from their session, not the form), and blank fields
 * are left as they were — the old version sent `phones: [""]`, wiping the phone,
 * and passed the contact id where Wix expects the member id.
 */
export const updateUser = async (_prev: UpdateUserState, formData: FormData): Promise<UpdateUserState> => {
  const wixClient = await wixClientServer();
  const clean = (key: string) => String(formData.get(key) || "").trim().slice(0, 80);
  const firstName = clean("firstName");
  const lastName = clean("lastName");
  const phone = clean("phone").replace(/[^\d+]/g, "");

  if (phone && phone.replace(/\D/g, "").length < 10) {
    return { error: "Enter a valid 10-digit mobile number." };
  }

  try {
    const { member } = await wixClient.members.getCurrentMember();
    if (!member?._id) return { error: "Please log in again to update your details." };

    await wixClient.members.updateMember(member._id, {
      contact: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(phone ? { phones: [phone] } : {}),
      },
      ...(firstName ? { profile: { nickname: [firstName, lastName].filter(Boolean).join(" ") } } : {}),
    });
    return { ok: true };
  } catch (err) {
    console.error("[updateUser] failed:", err);
    return { error: "Couldn't save your details. Please try again." };
  }
};
