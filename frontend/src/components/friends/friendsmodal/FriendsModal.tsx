import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance, { API_URL } from "@/api/axiosInstance";
import Mainbtn from "@/components/_UI/mainbtn/Mainbtn";
import Default from "@/assets/icons/monochrome/default-user.svg";
import AuthModal from "@/components/auth/authmodal/AuthModal";
import Reload from "@/assets/icons/monochrome/reload.svg";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useNotificationsStore } from "@/store/notificationsStore";
import { connectSocket } from "@/services/socketManager";
import classes from "./FriendsModal.module.scss";

type FriendStatus = "friend" | "none" | "sent" | "received" | "rejected";

interface Friend {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  created_at: string;
}

interface MeProfileResponse {
  friend_code?: string | null;
}

interface UserByFriendCodeResponse {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  created_at: string;
  status?: string | null;
}

type FriendSearchMessage = { kind: "error" | "success"; text: string } | null;

const declension = (number: number, titles: [string, string, string]) => {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return titles[2];
  if (n1 > 1 && n1 < 5) return titles[1];
  if (n1 === 1) return titles[0];
  return titles[2];
};

const timeAgo = (dateString: string) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears} ${declension(diffYears, ["год", "года", "лет"])}`;
  if (diffMonths > 0) return `${diffMonths} ${declension(diffMonths, ["месяц", "месяца", "месяцев"])}`;
  if (diffDays > 0) return `${diffDays} ${declension(diffDays, ["день", "дня", "дней"])}`;
  if (diffHours > 0) return `${diffHours} ${declension(diffHours, ["час", "часа", "часов"])}`;
  if (diffMinutes > 0) return `${diffMinutes} ${declension(diffMinutes, ["минуту", "минуты", "минут"])}`;
  return "только что";
};

const safeCopyToClipboard = (text: string) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise<void>((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (successful) resolve();
      else reject(new Error("Не удалось скопировать"));
    } catch (err) {
      document.body.removeChild(textarea);
      reject(err);
    }
  });
};

const FriendsModal = () => {
  const { isAuth, user, isInitialized } = useAuthStore();
  const friendsModalOpen = useUIStore((s) => s.friendsModalOpen);
  const friendsModalView = useUIStore((s) => s.friendsModalView);
  const closeFriendsModal = useUIStore((s) => s.closeFriendsModal);
  const setFriendsModalView = useUIStore((s) => s.setFriendsModalView);
  const openHeaderDropdown = useUIStore((s) => s.openHeaderDropdown);
  const setHighlightRequestId = useNotificationsStore((s) => s.setHighlightRequestId);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  const [friendStatusById, setFriendStatusById] = useState<Record<number, { status: FriendStatus; requestId?: number }>>({});
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friendCodeCopyText, setFriendCodeCopyText] = useState<string | null>(null);
  const [isFriendCodeGenerating, setIsFriendCodeGenerating] = useState(false);
  const [isFriendCodeRegenerating, setIsFriendCodeRegenerating] = useState(false);
  const [friendSearchCode, setFriendSearchCode] = useState("");
  const [friendSearchMessage, setFriendSearchMessage] = useState<FriendSearchMessage>(null);
  const [isFriendSearching, setIsFriendSearching] = useState(false);
  const [foundUserByCode, setFoundUserByCode] = useState<UserByFriendCodeResponse | null>(null);
  const [friendActionLoadingById, setFriendActionLoadingById] = useState<Record<number, boolean>>({});
  const friendSearchSeqRef = useRef(0);

  const mergeFriends = (current: Friend[], incoming: Friend[]) => {
    if (!current.length) return incoming;
    if (!incoming.length) return current;

    const incomingById = new Map(incoming.map((f) => [f.id, f] as const));
    const currentIds = new Set(current.map((f) => f.id));

    const next = current.map((f) => incomingById.get(f.id) ?? f);
    incoming.forEach((f) => {
      if (!currentIds.has(f.id)) next.push(f);
    });

    return next;
  };

  const getButtonText = (status: FriendStatus) => {
    if (status === "friend") return "удалить";
    if (status === "none") return "добавить";
    if (status === "sent") return "отправлено";
    if (status === "received") return "входящая заявка";
    if (status === "rejected") return "отклонено";
    return "";
  };

  const getButtonClass = (status: FriendStatus) => {
    if (status === "friend") return classes.friend_btn_remove;
    if (status === "none") return classes.friend_btn_add;
    if (status === "sent") return classes.friend_btn_sent;
    if (status === "rejected") return classes.friend_btn_disabled;
    if (status === "received") return classes.friend_btn_received;
    return "";
  };

  const fetchFriendsAndCode = async (userId: number) => {
    const [{ data: me }, { data: friendsData }] = await Promise.all([
      axiosInstance.get<MeProfileResponse>("/api/profile/me"),
      axiosInstance.get<Friend[]>(`/api/friends/all/${userId}`),
    ]);

    const friends = Array.isArray(friendsData) ? friendsData : [];
    const statuses: Record<number, { status: FriendStatus; requestId?: number }> = {};
    friends.forEach((f) => {
      statuses[f.id] = { status: "friend" };
    });

    return {
      friendCode: me.friend_code ?? null,
      friends,
      statuses,
    };
  };

  const reloadFriends = async (userId: number) => {
    const { data } = await axiosInstance.get<Friend[]>(`/api/friends/all/${userId}`);
    const fetchedFriends = Array.isArray(data) ? data : [];

    setFriends((prev) => mergeFriends(prev, fetchedFriends));
    setFriendStatusById((prev) => {
      const next = { ...prev };
      fetchedFriends.forEach((f) => {
        next[f.id] = { status: "friend" };
      });
      return next;
    });
  };

  useEffect(() => {
    if (!friendsModalOpen) return;

    setFriendCodeCopyText(null);
    setFriendSearchCode("");
    setFoundUserByCode(null);
    setFriendSearchMessage(null);
    setIsFriendSearching(false);

    if (!isInitialized) return;
    if (!isAuth || !user?.id) {
      setFriendCode(null);
      setFriends([]);
      setFriendStatusById({});
      return;
    }

    let mounted = true;
    setIsFriendsLoading(true);

    fetchFriendsAndCode(user.id)
      .then(({ friendCode, friends: fetchedFriends, statuses }) => {
        if (!mounted) return;
        setFriendCode(friendCode);
        setFriends((prev) => mergeFriends(prev, fetchedFriends));
        setFriendStatusById((prev) => ({ ...prev, ...statuses }));
      })
      .catch((err) => {
        console.error("Ошибка при загрузке друзей/кода дружбы", err);
        if (!mounted) return;
        setFriends([]);
        setFriendCode(null);
        setFriendStatusById({});
      })
      .finally(() => {
        if (!mounted) return;
        setIsFriendsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [friendsModalOpen, isInitialized, isAuth, user?.id]);

  useEffect(() => {
    if (!friendsModalOpen) return;
    if (!isInitialized) return;
    if (!isAuth || !user?.id) return;

    const unsubscribe = connectSocket({
      onFriendStatusChange: (data) => {
        const rawStatus = String(data?.status ?? "");
        const validStatuses: FriendStatus[] = ["friend", "none", "sent", "received", "rejected"];
        if (!validStatuses.includes(rawStatus as FriendStatus)) return;

        const status = rawStatus as FriendStatus;
        const requestId = typeof data.requestId === "number" ? data.requestId : undefined;

        setFriendStatusById((prev) => ({
          ...prev,
          [data.userId]: {
            status,
            requestId: requestId ?? prev[data.userId]?.requestId,
          },
        }));

        if (status === "friend") {
          reloadFriends(user.id).catch((err) => console.error("Ошибка при обновлении списка друзей", err));
        }
      },
    });

    return () => {
      unsubscribe?.();
    };
  }, [friendsModalOpen, isInitialized, isAuth, user?.id]);

  const handleGenerateFriendCode = async () => {
    if (isFriendCodeGenerating) return;
    try {
      setIsFriendCodeGenerating(true);
      const { data } = await axiosInstance.post<{ friend_code: string }>(`/api/profile/me/friend-code`);
      setFriendCode(data.friend_code);
    } catch (err) {
      console.error("Ошибка при генерации кода дружбы", err);
    } finally {
      setIsFriendCodeGenerating(false);
    }
  };

  const handleRegenerateFriendCode = async () => {
    if (isFriendCodeRegenerating) return;
    try {
      setIsFriendCodeRegenerating(true);
      setFriendCodeCopyText(null);
      const { data } = await axiosInstance.post<{ friend_code: string }>(`/api/profile/me/friend-code/regenerate`);
      setFriendCode(data.friend_code);
    } catch (err) {
      console.error("Ошибка при перегенерации кода дружбы", err);
    } finally {
      setIsFriendCodeRegenerating(false);
    }
  };

  const handleCopyFriendCode = (code: string) => {
    safeCopyToClipboard(code)
      .then(() => {
        setFriendCodeCopyText("скопировано");
        setTimeout(() => setFriendCodeCopyText(null), 1000);
      })
      .catch((err) => console.error("Ошибка при копировании кода дружбы:", err));
  };

  useEffect(() => {
    if (!friendsModalOpen) return;
    if (friendsModalView !== "search") return;
    if (!isInitialized) return;

    friendSearchSeqRef.current += 1;
    const seq = friendSearchSeqRef.current;

    const code = friendSearchCode.trim();
    setFriendSearchMessage(null);

    if (!code || code.length < 8) {
      setFoundUserByCode(null);
      setIsFriendSearching(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      if (seq !== friendSearchSeqRef.current) return;

      try {
        setIsFriendSearching(true);

        const { data: foundUser } = await axiosInstance.get<UserByFriendCodeResponse>(
          `/api/profile/by-friend-code/${code}`
        );

        if (seq !== friendSearchSeqRef.current) return;

        if (foundUser.id === user?.id) {
          setFoundUserByCode(null);
          setFriendSearchMessage({ kind: "error", text: "Это ваш код" });
          return;
        }

        setFoundUserByCode(foundUser);

        if (!isAuth || !user?.id) return;
        const { data: statusData } = await axiosInstance.get<{ status: FriendStatus; requestId?: number }>(
          `/api/friends/status/${foundUser.id}`
        );

        if (seq !== friendSearchSeqRef.current) return;

        const rawStatus = String(statusData?.status ?? "");
        const validStatuses: FriendStatus[] = ["friend", "none", "sent", "received", "rejected"];
        if (!validStatuses.includes(rawStatus as FriendStatus)) return;

        setFriendStatusById((prev) => ({
          ...prev,
          [foundUser.id]: {
            status: rawStatus as FriendStatus,
            requestId: typeof statusData?.requestId === "number" ? statusData.requestId : undefined,
          },
        }));
      } catch (err: any) {
        if (seq !== friendSearchSeqRef.current) return;

        setFoundUserByCode(null);

        const status = err?.response?.status;
        const message = err?.response?.data?.message;

        if (status === 404) {
          setFriendSearchMessage({ kind: "error", text: "пользователь не найден" });
        } else if (typeof message === "string") {
          setFriendSearchMessage({ kind: "error", text: message });
        } else {
          setFriendSearchMessage({ kind: "error", text: "Ошибка поиска" });
        }
      } finally {
        if (seq === friendSearchSeqRef.current) setIsFriendSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    friendSearchCode,
    friendsModalOpen,
    friendsModalView,
    isInitialized,
    isAuth,
    user?.id,
  ]);

  const handleFriendAction = async (otherUserId: number) => {
    if (friendActionLoadingById[otherUserId]) return;

    const current = friendStatusById[otherUserId]?.status ?? "none";
    const requestId = friendStatusById[otherUserId]?.requestId;

    try {
      setFriendActionLoadingById((prev) => ({ ...prev, [otherUserId]: true }));

      if (current === "friend") {
        await axiosInstance.delete(`/api/friends/${otherUserId}`);
        setFriendStatusById((prev) => ({ ...prev, [otherUserId]: { status: "none" } }));
        return;
      }

      if (current === "none") {
        const { data } = await axiosInstance.post<{ id: number }>(`/api/friends/send`, { friend_id: otherUserId });
        setFriendStatusById((prev) => ({
          ...prev,
          [otherUserId]: { status: "sent", requestId: data.id },
        }));
        return;
      }

      if (current === "sent" && requestId) {
        await axiosInstance.delete(`/api/friends/remove-request/${requestId}`);
        setFriendStatusById((prev) => ({ ...prev, [otherUserId]: { status: "none" } }));
      }
    } catch (err) {
      console.error("Ошибка при действии с другом", err);
    } finally {
      setFriendActionLoadingById((prev) => ({ ...prev, [otherUserId]: false }));
    }
  };

  const openIncomingRequest = (requestId?: number) => {
    closeFriendsModal();
    openHeaderDropdown("notifications");
    setHighlightRequestId(requestId ?? null);
  };

  const friendsListContent = useMemo(() => {
    if (!isInitialized) return <p>загрузка...</p>;
    if (!isAuth) return <p>войдите, чтобы пользоваться друзьями</p>;
    if (isFriendsLoading) return <p>загрузка...</p>;

    if (friends.length === 0) {
      return <p>у вас пока нет друзей</p>;
    }

    return (
      <div className={classes.friends_item_con}>
        {friends.map((friend) => {
          const status = friendStatusById[friend.id]?.status ?? "none";
          const requestId = friendStatusById[friend.id]?.requestId;
          const avatarSrc = friend.avatar
            ? friend.avatar.startsWith("/uploads/")
              ? `${API_URL}${friend.avatar}`
              : `${API_URL}/uploads/${friend.avatar}`
            : null;

          return (
            <div key={friend.id} className={classes.friend_item}>
              <Link to={`/user/${friend.username}`} className={classes.friend_info}>
                <div className={classes.friend_info_wrap}>
                  {avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <Default />}
                  <div className={classes.friend_info_text}>
                    <span>{friend.nickname || friend.username}</span>
                    <p>в друзьях: {timeAgo(friend.created_at)}</p>
                  </div>
                </div>
              </Link>
              <div className={getButtonClass(status)}>
                <Mainbtn
                  text={getButtonText(status)}
                  variant="auth"
                  kind="button"
                  disabled={status === "rejected" || Boolean(friendActionLoadingById[friend.id])}
                  onClick={() => {
                    if (status === "received") {
                      openIncomingRequest(requestId);
                      return;
                    }
                    handleFriendAction(friend.id);
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [
    closeFriendsModal,
    friends,
    getButtonClass,
    getButtonText,
    isAuth,
    isFriendsLoading,
    isInitialized,
    friendStatusById,
    openIncomingRequest,
    friendActionLoadingById,
  ]);

  return (
    <AuthModal isOpen={friendsModalOpen} onClose={closeFriendsModal}>
      <div className={classes.friends_modal}>
        <div className={classes.friends_toggleButtons}>
          <button
            type="button"
            className={friendsModalView === "list" ? classes.friends_toggleActive : ""}
            onClick={() => setFriendsModalView("list")}
          >
            Мои друзья
          </button>
          <button
            type="button"
            className={friendsModalView === "search" ? classes.friends_toggleActive : ""}
            onClick={() => setFriendsModalView("search")}
          >
            Найти друга
          </button>
        </div>

        {friendsModalView === "list" ? (
          friendsListContent
        ) : (
          <div className={classes.findFriendContainer}>
            <div className={classes.friend_code_block}>
              <span>Ваш код дружбы:</span>
              {!friendCode ? (
                <Mainbtn
                  text={isFriendCodeGenerating ? "генерируем..." : "сгенерировать"}
                  variant="mini"
                  kind="button"
                  disabled={isFriendCodeGenerating}
                  onClick={handleGenerateFriendCode}
                />
              ) : (
                <div className={classes.code_btns}>
                  <Mainbtn
                    text={friendCodeCopyText ?? friendCode}
                    variant="mini"
                    kind="button"
                    onClick={() => handleCopyFriendCode(friendCode)}
                  />
                  <button
                    type="button"
                    className={classes.friend_code_reload_btn}
                    onClick={handleRegenerateFriendCode}
                    disabled={isFriendCodeRegenerating}
                    aria-label="Перегенерировать код дружбы"
                    title="Перегенерировать"
                  >
                    <Reload />
                  </button>
                </div>
              )}
            </div>

            <div className={classes.friend_search_block}>
              <span>Найти друга</span>
              <div className={classes.friend_search_controls}>
                <input
                  type="text"
                  id="searchfriend"
                  value={friendSearchCode}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setFriendSearchCode(next);
                    setFoundUserByCode(null);
                    setFriendSearchMessage(null);
                  }}
                  placeholder="введите код дружбы"
                  inputMode="numeric"
                  pattern="\\d*"
                  maxLength={8}
                  autoComplete="off"
                />
              </div>

              {isFriendSearching && friendSearchCode.trim().length === 8 && (
                <p className={classes.friend_search_success}>поиск...</p>
              )}

              {friendSearchMessage && (
                <p
                  className={
                    friendSearchMessage.kind === "error"
                      ? classes.friend_search_error
                      : classes.friend_search_success
                  }
                >
                  {friendSearchMessage.text}
                </p>
              )}

              {foundUserByCode && (
                <div className={classes.friend_search_result}>
                  <div className={classes.friend_item}>
                    <Link
                      to={`/user/${foundUserByCode.username}`}
                      className={classes.friend_info}
                      onClick={() => closeFriendsModal()}
                    >
                      <div className={classes.friend_info_wrap}>
                        {(() => {
                          const avatarSrc = foundUserByCode.avatar
                            ? foundUserByCode.avatar.startsWith("/uploads/")
                              ? `${API_URL}${foundUserByCode.avatar}`
                              : `${API_URL}/uploads/${foundUserByCode.avatar}`
                            : null;

                          return avatarSrc ? <img src={avatarSrc} alt="avatar" /> : <Default />;
                        })()}
                        <div className={classes.friend_info_text}>
                          <span>{foundUserByCode.nickname || foundUserByCode.username}</span>
                          {(() => {
                            const status = friendStatusById[foundUserByCode.id]?.status ?? "none";
                            const friendMeta = friends.find((f) => f.id === foundUserByCode.id);
                            if (status !== "friend" || !friendMeta?.created_at) return null;
                            return <p>в друзьях: {timeAgo(friendMeta.created_at)}</p>;
                          })()}
                        </div>
                      </div>
                    </Link>

                    {(() => {
                      const status = friendStatusById[foundUserByCode.id]?.status ?? "none";
                      const requestId = friendStatusById[foundUserByCode.id]?.requestId;

                      return (
                        <div className={getButtonClass(status)}>
                          <Mainbtn
                            text={getButtonText(status)}
                            variant="auth"
                            kind="button"
                            disabled={status === "rejected" || Boolean(friendActionLoadingById[foundUserByCode.id])}
                            onClick={() => {
                              if (status === "received") {
                                openIncomingRequest(requestId);
                                return;
                              }
                              handleFriendAction(foundUserByCode.id);
                            }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthModal>
  );
};

export default FriendsModal;
