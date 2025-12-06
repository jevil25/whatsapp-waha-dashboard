"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "~/trpc/react";

interface Channel {
  id: string;
  name: string;
  picture?: string;
  inviteCode?: string;
  createdAt?: string;
}

interface ChannelManagementProps {
  sessionName: string;
}

export default function ChannelManagement({ sessionName }: ChannelManagementProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [invitePhoneNumber, setInvitePhoneNumber] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels, refetch: refetchChannels, isLoading } = api.user.getWhatsAppChannels.useQuery({
    sessionName,
  });

  const { data: channelMessages, refetch: refetchMessages } = api.user.getChannelMessages.useQuery(
    {
      sessionName,
      channelId: selectedChannel?.id ?? '',
      limit: 50,
    },
    {
      enabled: showMessagesModal && !!selectedChannel?.id,
    }
  );

  const createChannelMutation = api.user.createChannel.useMutation({
    onSuccess: () => {
      void refetchChannels();
      setShowCreateModal(false);
      setChannelName("");
      setChannelDescription("");
      alert("Channel created successfully!");
    },
    onError: (error) => {
      alert(`Failed to create channel: ${error.message}`);
    },
  });

  // NOTE: Delete channel is not currently supported by WhatsApp/WAHA
  // const deleteChannelMutation = api.user.deleteChannel.useMutation({
  //   onSuccess: () => {
  //     void refetchChannels();
  //     setShowDetailsModal(false);
  //     alert("Channel deleted successfully!");
  //   },
  //   onError: (error) => {
  //     alert(`Failed to delete channel: ${error.message}`);
  //   },
  // });

  const generateInviteMutation = api.user.generateChannelInvite.useMutation({
    onSuccess: (data) => {
      setInviteLink(data.inviteLink);
    },
    onError: (error) => {
      alert(`Failed to generate invite: ${error.message}`);
      setShowInviteModal(false);
    },
  });

  const sendMessageMutation = api.user.sendMessage.useMutation({
    onSuccess: () => {
      alert("Invite sent successfully via WhatsApp!");
      setInvitePhoneNumber("");
    },
    onError: (error) => {
      alert(`Failed to send invite: ${error.message}`);
    },
  });

  const revokeInviteMutation = api.user.revokeChannelInvite.useMutation({
    onSuccess: () => {
      setInviteLink("");
      void refetchChannels();
      alert("Invite link revoked successfully!");
    },
    onError: (error) => {
      alert(`Failed to revoke invite: ${error.message}`);
    },
  });

  const sendChannelMessageMutation = api.user.sendMessage.useMutation({
    onSuccess: () => {
      setMessageText("");
      void refetchMessages();
    },
    onError: (error) => {
      alert(`Failed to send message: ${error.message}`);
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (showMessagesModal && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages, showMessagesModal]);

  const sendChannelImageMutation = api.user.sendImage.useMutation({
    onSuccess: () => {
      setMessageText("");
      setSelectedImage(null);
      setImagePreview(null);
      void refetchMessages();
    },
    onError: (error) => {
      alert(`Failed to send image: ${error.message}`);
    },
  });

  // NOTE: Manage admins disabled per user request
  // const manageAdminMutation = api.user.manageChannelAdmins.useMutation({
  //   onSuccess: () => {
  //     void refetchChannels();
  //     setShowAdminModal(false);
  //     setAdminPhone("");
  //     alert("Admin updated successfully!");
  //   },
  //   onError: (error) => {
  //     alert(`Failed to manage admin: ${error.message}`);
  //   },
  // });

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;

    await createChannelMutation.mutateAsync({
      sessionName,
      name: channelName,
      description: channelDescription,
    });
  };

  // NOTE: Delete channel is not currently supported by WhatsApp/WAHA
  // const handleDeleteChannel = async (channelId: string) => {
  //   if (!confirm("Are you sure you want to delete this channel?")) return;
  //   await deleteChannelMutation.mutateAsync({
  //     sessionName,
  //     channelId,
  //   });
  // };

  const handleGenerateInvite = (channelId: string) => {
    setSelectedChannel(channels?.find(c => c.id === channelId) ?? null);
    setShowInviteModal(true);
  };

  const handleSubmitInvite = async () => {
    if (!selectedChannel) return;

    try {
      const inviteData = await generateInviteMutation.mutateAsync({
        sessionName,
        channelId: selectedChannel.id,
      });
      
      // If phone number is provided, send the invite link via WhatsApp
      if (invitePhoneNumber.trim()) {
        const chatId = invitePhoneNumber.trim().startsWith("+") 
          ? `${invitePhoneNumber.trim().replace(/^\+/, '')}@c.us`
          : `${invitePhoneNumber.trim()}@c.us`;
        
        const message = `You've been invited to join our WhatsApp channel!\n\nJoin here: ${inviteData.inviteLink}`;
        
        // Send message without awaiting so invite link shows immediately
        void sendMessageMutation.mutateAsync({
          sessionName,
          chatId,
          text: message,
        });
      }
    } catch (error) {
      console.error('Error generating invite:', error);
    }
  };

  const handleRevokeInvite = async (channelId: string) => {
    if (!confirm("Are you sure you want to revoke the invite link?")) return;

    await revokeInviteMutation.mutateAsync({
      sessionName,
      channelId,
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel) return;

    // If there's an image, upload it first then send
    if (selectedImage) {
      const formData = new FormData();
      formData.append('image', selectedImage);

      try {
        const uploadResponse = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload image');
        }

        const uploadData = await uploadResponse.json() as { url: string };
        
        await sendChannelImageMutation.mutateAsync({
          sessionName,
          chatId: selectedChannel.id,
          imageUrl: uploadData.url,
          caption: messageText || undefined,
        });
      } catch (error) {
        alert('Failed to upload and send image');
        console.error(error);
      }
    } else if (messageText.trim()) {
      // Send text only
      await sendChannelMessageMutation.mutateAsync({
        sessionName,
        chatId: selectedChannel.id,
        text: messageText,
      });
    }
  };

  // NOTE: Manage admins disabled per user request
  // const handleManageAdmin = async (e: React.FormEvent, action: "promote" | "demote") => {
  //   e.preventDefault();
  //   if (!selectedChannel || !adminPhone.trim()) return;

  //   await manageAdminMutation.mutateAsync({
  //     sessionName,
  //     channelId: selectedChannel.id,
  //     phoneNumbers: [adminPhone],
  //     action,
  //   });
  // };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Channel Management</h2>
          <p className="mt-1 text-sm text-gray-400">Create and manage your WhatsApp channels</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-xl"
        >
          + Create Channel
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : channels && channels.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel: Channel) => (
            <div
              key={channel.id}
              className="group rounded-xl border border-gray-700/50 bg-gradient-to-br from-gray-800 to-gray-900 p-6 shadow-lg transition-all hover:border-blue-500/50 hover:shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">{channel.name}</h3>
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSelectedChannel(channel);
                    setShowDetailsModal(true);
                  }}
                  className="w-full rounded-lg bg-blue-600/20 px-4 py-2.5 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-600/30"
                >
                  📋 View Details
                </button>
                <button
                  onClick={() => {
                    setSelectedChannel(channel);
                    setShowMessagesModal(true);
                  }}
                  className="w-full rounded-lg bg-purple-600/20 px-4 py-2.5 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-600/30"
                >
                  💬 View Messages
                </button>
                <button
                  onClick={() => handleGenerateInvite(channel.id)}
                  disabled={generateInviteMutation.isPending}
                  className="w-full rounded-lg bg-green-600/20 px-4 py-2.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-600/30 disabled:opacity-50"
                >
                  {generateInviteMutation.isPending ? "Generating..." : "🔗 Generate Invite"}
                </button>
                {/* NOTE: Manage admins disabled per user request */}
                {/* <button
                  onClick={() => {
                    setSelectedChannel(channel);
                    setShowAdminModal(true);
                  }}
                  className="w-full rounded-lg bg-purple-600/20 px-4 py-2.5 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-600/30"
                >
                  👥 Manage Admins
                </button> */}
                {/* NOTE: Delete channel is not currently supported by WhatsApp/WAHA */}
                {/* <button
                  onClick={() => handleDeleteChannel(channel.id)}
                  disabled={deleteChannelMutation.isPending}
                  className="w-full rounded-lg bg-red-600/20 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                >
                  {deleteChannelMutation.isPending ? "Deleting..." : "🗑️ Delete"}
                </button> */}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-12 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-700 flex items-center justify-center">
            <span className="text-3xl">📢</span>
          </div>
          <h3 className="mb-2 text-xl font-semibold text-white">No Channels Yet</h3>
          <p className="text-gray-400">Create your first channel to get started</p>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-6 text-2xl font-bold text-white">Create New Channel</h3>
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Channel Name *
                </label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="Enter channel name"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Description (Optional)
                </label>
                <textarea
                  value={channelDescription}
                  onChange={(e) => setChannelDescription(e.target.value)}
                  placeholder="Enter channel description"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createChannelMutation.isPending}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createChannelMutation.isPending ? "Creating..." : "Create Channel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Link Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-6 text-2xl font-bold text-white">Channel Invite</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Phone Number (Optional)
                </label>
                <input
                  type="text"
                  value={invitePhoneNumber}
                  onChange={(e) => setInvitePhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Enter a phone number to send the invite via WhatsApp
                </p>
              </div>
              
              {inviteLink ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Invite Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      {copiedInvite ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSubmitInvite}
                  disabled={generateInviteMutation.isPending || sendMessageMutation.isPending}
                  className="w-full rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {generateInviteMutation.isPending || sendMessageMutation.isPending 
                    ? "Generating..." 
                    : invitePhoneNumber.trim() 
                      ? "Generate & Send Invite" 
                      : "Generate Invite"}
                </button>
              )}
              
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInvitePhoneNumber("");
                  setInviteLink("");
                }}
                className="w-full rounded-lg bg-gray-700 px-4 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTE: Manage Admins Modal - Disabled per user request */}
      {/* {showAdminModal && selectedChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setShowAdminModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-6 text-2xl font-bold text-white">
              Manage Admins
            </h3>
            <p className="mb-4 text-sm text-gray-400">Channel: {selectedChannel.name}</p>
            <form className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleManageAdmin(e, "demote")}
                  disabled={manageAdminMutation.isPending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Demote
                </button>
                <button
                  type="button"
                  onClick={(e) => handleManageAdmin(e, "promote")}
                  disabled={manageAdminMutation.isPending}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Promote
                </button>
              </div>
            </form>
          </div>
        </div>
      )} */}

      {/* Channel Details Modal */}
      {showDetailsModal && selectedChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-6 text-2xl font-bold text-white">Channel Details</h3>
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-700/50 p-4">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Name
                </label>
                <p className="text-lg font-semibold text-white">{selectedChannel.name}</p>
              </div>
              <div className="rounded-lg bg-gray-700/50 p-4">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Channel ID
                </label>
                <p className="break-all text-sm font-mono text-gray-300">{selectedChannel.id}</p>
              </div>
              {selectedChannel.inviteCode && (
                <div className="rounded-lg bg-gray-700/50 p-4">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Active Invite Code
                  </label>
                  <div className="flex gap-2">
                    <p className="flex-1 break-all text-sm font-mono text-gray-300">
                      {selectedChannel.inviteCode}
                    </p>
                    <button
                      onClick={() => handleRevokeInvite(selectedChannel.id)}
                      disabled={revokeInviteMutation.isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {revokeInviteMutation.isPending ? "..." : "Revoke"}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowDetailsModal(false)}
                className="w-full rounded-lg bg-gray-700 px-4 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Modal */}
      {showMessagesModal && selectedChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setShowMessagesModal(false)}
        >
          <div
            className="w-full max-w-4xl rounded-xl bg-gray-800 p-6 shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-gray-700 pb-4">
              <div>
                <h3 className="text-2xl font-bold text-white">Channel Messages</h3>
                <p className="text-sm text-gray-400">{selectedChannel.name}</p>
              </div>
              <button
                onClick={() => {
                  void refetchMessages();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                🔄 Refresh
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {!channelMessages || channelMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 text-6xl">💬</div>
                  <p className="text-lg font-medium text-gray-400">No messages yet</p>
                  <p className="text-sm text-gray-500">Messages will appear here once they are sent or received</p>
                </div>
              ) : (
                channelMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg p-4 ${
                      message.fromMe
                        ? 'ml-8 bg-blue-600/20 border-l-4 border-blue-500'
                        : 'mr-8 bg-gray-700/50 border-l-4 border-gray-500'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${message.fromMe ? 'text-blue-400' : 'text-gray-400'}`}>
                          {message.fromMe ? '📤 Sent' : '📥 Received'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(message.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {message.ackName && (
                        <span className="text-xs text-gray-500">
                          {message.ackName}
                        </span>
                      )}
                    </div>
                    
                    {message.body && (
                      <p className="text-sm text-white whitespace-pre-wrap break-words">
                        {message.body}
                      </p>
                    )}
                    
                    {message.hasMedia && message.mediaUrl && (
                      <div className="mt-2">
                        <a
                          href={message.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-500"
                        >
                          📎 View Media
                        </a>
                      </div>
                    )}
                    
                    <div className="mt-2 text-xs text-gray-500">
                      From: {message.from}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Section */}
            <div className="mt-4 border-t border-gray-700 pt-4">
              <form onSubmit={handleSendMessage} className="space-y-3">
                {imagePreview && (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white hover:bg-red-700"
                    >
                      &times;
                    </button>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                  
                  <label className="flex cursor-pointer items-center justify-center rounded-lg bg-gray-700 px-4 transition-colors hover:bg-gray-600">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <span className="text-2xl">📷</span>
                  </label>
                  
                  <button
                    type="submit"
                    disabled={(!messageText.trim() && !selectedImage) || sendChannelMessageMutation.isPending || sendChannelImageMutation.isPending}
                    className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {(sendChannelMessageMutation.isPending || sendChannelImageMutation.isPending) ? '...' : '📤 Send'}
                  </button>
                </div>
              </form>
              
              <button
                onClick={() => {
                  setShowMessagesModal(false);
                  setMessageText("");
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
                className="mt-3 w-full rounded-lg bg-gray-700 px-4 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
