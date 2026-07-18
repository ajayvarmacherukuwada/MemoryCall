"use client";

import { useEffect, useMemo, useState } from "react";
import { createContact, fetchContacts, type ContactCreationResult, type ContactSummary } from "@/lib/contacts-client";

export function formatContactDisplayName(contact: Pick<ContactSummary, "displayName" | "nickname" | "email">) {
  const nickname = contact.nickname?.trim();
  if (nickname) {
    return nickname;
  }

  const displayName = contact.displayName.trim();
  if (displayName) {
    return displayName;
  }

  const localPart = contact.email.split("@")[0] ?? contact.email;
  return localPart
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function useContacts(enabled: boolean) {
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useMemo(
    () => async (isCancelledRef?: { current: boolean }) => {
      if (!enabled) {
        setContacts([]);
        setLoading(false);
        setError(null);
        return [] as ContactSummary[];
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchContacts();
        if (!isCancelledRef?.current) {
          setContacts(response.contacts);
        }
        return response.contacts;
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to load contacts.";
        if (!isCancelledRef?.current) {
          setError(message);
        }
        return [] as ContactSummary[];
      } finally {
        if (!isCancelledRef?.current) {
          setLoading(false);
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    const cancelled = { current: false };
    void loadContacts(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [loadContacts]);

  const addNewContact = async (input: { email: string; displayName: string }): Promise<ContactCreationResult> => {
    const response = await createContact(input);
    if (response.status === "contact_added") {
      setContacts((current) => [response.contact, ...current.filter((contact) => contact.id !== response.contact.id)]);
    }

    return response;
  };

  return {
    contacts,
    loading,
    error,
    refreshContacts: async () => {
      const contactsList = await loadContacts();
      return contactsList;
    },
    addContact: addNewContact,
  };
}
