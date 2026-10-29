import SwiftUI

struct NotificationsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GScreen(id: "screen-notificaciones") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Bandeja")
                        GTitle(text: "Notificaciones")
                    }

                    cuentaRow

                    if model.notifications.isEmpty {
                        emptyState
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(model.notifications) { item in
                                notificationCard(item)
                            }
                        }
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-notificaciones")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-notificaciones") }
        .task { await model.markNotificationsReadOnOpen() }
    }

    private var emptyState: some View {
        GCard(radius: 18, padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Nada nuevo")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("Cuando te inviten a un grupo o te escriba un club, aparece acá.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
            }
        }
        .accessibilityIdentifier("notifications-empty")
    }

    private var cuentaRow: some View {
        Button { model.presentClubs() } label: {
            GCard(radius: 16, padding: 14) {
                HStack(spacing: 12) {
                    AvatarCircle(initials: model.profile.initials)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Tu cuenta")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text("Clubes y Golfistics App")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(p.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("notifications-cuenta")
    }

    @ViewBuilder
    private func notificationCard(_ item: InboxNotification) -> some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 10) {
                        unreadDot(item.isUnread)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.kind.title.uppercased())
                                .font(GType.overline)
                                .tracking(0.8)
                                .foregroundStyle(item.isUnread ? p.accent : p.ink3)
                            Text(item.title)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .accessibilityLabel(item.isUnread ? "Sin leer, \(item.title)" : item.title)
                            if !item.body.isEmpty {
                                Text(item.body)
                                    .font(GType.body)
                                    .foregroundStyle(p.ink2)
                            }
                            metaLine(item)
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    Task { await model.openNotification(item) }
                }

                if item.kind == .groupInvite, let invite = item.resolvedInvite(from: model.pendingInvites) {
                    if invite.alreadyMember {
                        Text("Ya estás en este grupo.")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    } else {
                        HStack(spacing: 10) {
                            Button {
                                Task { await model.acceptInvite(invite, openGroup: false) }
                            } label: {
                                Text(model.isBusy ? "Entrando…" : "Aceptar")
                                    .font(GType.headline)
                                    .foregroundStyle(p.onPrimary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(p.primary)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(model.isBusy)
                            .accessibilityIdentifier("notification-accept-\(item.id)")

                            Button {
                                Task { await model.declineInvite(invite) }
                            } label: {
                                Text("Rechazar")
                                    .font(GType.headline)
                                    .foregroundStyle(p.negative)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(p.surface2)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(model.isBusy)
                            .accessibilityIdentifier("notification-decline-\(item.id)")
                        }
                    }
                }
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(item.isUnread ? p.accent.opacity(0.35) : Color.clear, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notification-\(item.id)")
    }

    private func unreadDot(_ unread: Bool) -> some View {
        Circle()
            .fill(unread ? Color(hex: 0xB4553F) : Color.clear)
            .frame(width: 8, height: 8)
            .padding(.top, 6)
            .accessibilityHidden(!unread)
    }

    private func metaLine(_ item: InboxNotification) -> Text {
        var parts: [String] = []
        if item.createdAt > .distantPast {
            parts.append(FormatAR.syncDay(item.createdAt))
        }
        if let club = item.clubName, !club.isEmpty {
            parts.append(club)
        }
        return Text(parts.joined(separator: " · "))
    }
}
