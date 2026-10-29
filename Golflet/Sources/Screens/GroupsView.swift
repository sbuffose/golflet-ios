import PhotosUI
import SwiftUI
import UIKit

struct GroupsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GScreen(id: "screen-grupos") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Jugás con otros")
                        GTitle(text: "Grupos")
                    }
                    Text("Compará métricas con tu grupo. Cada uno elige qué mostrar y cómo ver el ranking.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    if !model.pendingInvites.isEmpty {
                        pendingSection
                    }

                    if model.groups.isEmpty {
                        emptyGroups
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Tus grupos")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            ForEach(model.groups) { group in
                                Button {
                                    model.presentedGroupID = group.id
                                } label: {
                                    groupRow(group)
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("group-\(group.id)")
                            }
                        }
                    }

                    Button {
                        model.showsCreateGroup = true
                    } label: {
                        Text("Crear un grupo")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .accessibilityIdentifier("groups-create")

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
        .accessibilityIdentifier("screen-grupos")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-grupos") }
        .task { await model.refreshGroups() }
    }

    private var pendingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Invitaciones pendientes")
                .font(GType.section)
                .foregroundStyle(p.ink)
            ForEach(model.pendingInvites) { invite in
                Button {
                    model.presentedInvite = invite
                } label: {
                    GCard(radius: 18, padding: 14) {
                        HStack(spacing: 12) {
                            GroupPhotoView(url: invite.photoURL, initials: invite.ownerInitials, size: 44)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(invite.name)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text("Te invita \(invite.ownerName)")
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
                .accessibilityIdentifier("pending-invite-\(invite.token)")
            }
        }
    }

    private var emptyGroups: some View {
        GCard(radius: 18, padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Todavía no estás en un grupo")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("Creá uno y compartí el link, o aceptá una invitación.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
            }
        }
        .accessibilityIdentifier("groups-empty")
    }

    private func groupRow(_ group: GolfletGroup) -> some View {
        GCard(radius: 18, padding: 14) {
            HStack(spacing: 12) {
                GroupPhotoView(url: group.photoURL, initials: GroupsParser.initials(group.name), size: 44)
                VStack(alignment: .leading, spacing: 4) {
                    Text(group.name)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("\(group.memberCount) \(group.memberCount == 1 ? "miembro" : "miembros") · \(group.myRole.title)")
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
}

struct CreateGroupView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var pickerItem: PhotosPickerItem?
    @State private var photoData: Data?

    var body: some View {
        GScreen(id: "screen-crear-grupo") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Nuevo")
                        GTitle(text: "Crear grupo")
                    }
                    Text("El nombre lo pueden cambiar los admin. La foto es opcional.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        HStack(spacing: 14) {
                            GroupPhotoImage(data: photoData, initials: GroupsParser.initials(name.isEmpty ? "G" : name), size: 72)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(photoData == nil ? "Elegir una foto" : "Cambiar la foto")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text("De tu carrete, si querés")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("group-photo-picker")

                    GField(label: "Nombre del grupo") {
                        TextField("Los del sábado", text: $name)
                            .textInputAutocapitalization(.words)
                            .accessibilityIdentifier("group-name")
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }

                    Button {
                        Task {
                            await model.createGroup(
                                name: name,
                                photoJPEG: photoData.map { GroupPhoto.jpegData(from: $0) }
                            )
                            if model.errorMessage == nil {
                                dismiss()
                            }
                        }
                    } label: {
                        Text(model.isBusy ? "Creando…" : "Crear grupo")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isBusy)
                    .accessibilityIdentifier("group-create-submit")
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-crear-grupo")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-crear-grupo") }
        .onChange(of: pickerItem) { _, item in
            Task {
                photoData = try? await item?.loadTransferable(type: Data.self)
            }
        }
    }
}

struct GroupInviteView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let invite: GroupInvitePreview

    var body: some View {
        GScreen(id: "screen-invitacion") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Invitación")
                        GTitle(text: invite.name)
                    }
                    HStack(spacing: 14) {
                        GroupPhotoView(url: invite.photoURL, initials: GroupsParser.initials(invite.name), size: 72)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Te invita \(invite.ownerName)")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("\(invite.members.count) \(invite.members.count == 1 ? "miembro" : "miembros")")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                    }
                    .accessibilityIdentifier("invite-header")

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Quiénes están")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        ForEach(invite.members) { member in
                            HStack(spacing: 12) {
                                GroupPhotoView(url: member.photoURL, initials: member.initials, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.name)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Text(member.isOwner ? "Dueño · \(member.role.title)" : member.role.title)
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                            }
                            .accessibilityIdentifier("invite-member-\(member.id)")
                        }
                    }

                    if invite.alreadyMember {
                        Text("Ya estás en este grupo.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }

                    if !invite.alreadyMember {
                        Button {
                            Task { await model.acceptInvite(invite) }
                        } label: {
                            Text(model.isBusy ? "Entrando…" : "Aceptar")
                                .font(GType.headline)
                                .foregroundStyle(p.onPrimary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(p.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .disabled(model.isBusy)
                        .accessibilityIdentifier("invite-accept")

                        Button {
                            Task { await model.declineInvite(invite) }
                        } label: {
                            Text("Rechazar")
                                .font(GType.headline)
                                .foregroundStyle(p.negative)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(p.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .disabled(model.isBusy)
                        .accessibilityIdentifier("invite-decline")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-invitacion")
        .safeAreaInset(edge: .top) { closeBar(action: { model.presentedInvite = nil }, id: "close-invitacion") }
    }
}

struct InviteShareView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.openURL) private var openURL
    let payload: InviteSharePayload
    @State private var showsSystemShare = false
    @State private var copied = false

    var body: some View {
        GScreen(id: "screen-compartir-grupo") {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    GOverline(text: "Listo")
                    GTitle(text: payload.groupName, size: 30)
                }
                Text("Compartí el link para que se sumen.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)

                GCard(radius: 18, padding: 14) {
                    Text(payload.url.absoluteString)
                        .font(GType.label)
                        .foregroundStyle(p.ink)
                        .textSelection(.enabled)
                        .accessibilityIdentifier("invite-link")
                }

                Button(action: shareWhatsApp) {
                    Text("Compartir por WhatsApp")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .accessibilityIdentifier("share-whatsapp")

                Button {
                    UIPasteboard.general.string = payload.url.absoluteString
                    copied = true
                } label: {
                    Text(copied ? "Link copiado" : "Copiar link")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(p.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .accessibilityIdentifier("share-copy")

                Button { showsSystemShare = true } label: {
                    Text("Más opciones")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("share-more")
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .accessibilityIdentifier("screen-compartir-grupo")
        .safeAreaInset(edge: .top) { closeBar(action: { model.inviteShare = nil }, id: "close-compartir") }
        .sheet(isPresented: $showsSystemShare) {
            InviteShareSheet(url: payload.url, groupName: payload.groupName)
        }
    }

    private func shareWhatsApp() {
        let text = "Sumate a \(payload.groupName) en Golflet: \(payload.url.absoluteString)"
        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let appURL = URL(string: "whatsapp://send?text=\(encoded)"), UIApplication.shared.canOpenURL(appURL) {
            openURL(appURL)
        } else if let web = URL(string: "https://wa.me/?text=\(encoded)") {
            openURL(web)
        }
    }
}

struct InviteShareSheet: UIViewControllerRepresentable {
    let url: URL
    let groupName: String

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let text = "Sumate a \(groupName) en Golflet: \(url.absoluteString)"
        let controller = UIActivityViewController(
            activityItems: [text, url],
            applicationActivities: [WhatsAppInviteActivity(url: url, groupName: groupName)]
        )
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

final class WhatsAppInviteActivity: UIActivity {
    let url: URL
    let groupName: String

    init(url: URL, groupName: String) {
        self.url = url
        self.groupName = groupName
        super.init()
    }

    override var activityTitle: String? { "Compartir por WhatsApp" }
    override var activityType: UIActivity.ActivityType? { UIActivity.ActivityType("app.golflet.shareWhatsApp") }
    override var activityImage: UIImage? { UIImage(systemName: "message.fill") }

    override func canPerform(withActivityItems activityItems: [Any]) -> Bool { true }

    override func perform() {
        let text = "Sumate a \(groupName) en Golflet: \(url.absoluteString)"
        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let appURL = URL(string: "whatsapp://send?text=\(encoded)"), UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL)
        } else if let web = URL(string: "https://wa.me/?text=\(encoded)") {
            UIApplication.shared.open(web)
        }
        activityDidFinish(true)
    }
}

struct GroupPhotoView: View {
    @Environment(\.palette) private var p
    var url: String?
    var initials: String
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let url, let parsed = URL(string: url), parsed.scheme == "https" || parsed.scheme == "http" {
                AsyncImage(url: parsed) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    monogram
                }
            } else {
                monogram
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var monogram: some View {
        Text(initials)
            .font(GFont.ui(size < 40 ? 13 : 20, weight: .semibold))
            .foregroundStyle(p.onPrimary)
            .frame(width: size, height: size)
            .background(p.primary)
    }
}

struct GroupPhotoImage: View {
    @Environment(\.palette) private var p
    var data: Data?
    var initials: String
    var size: CGFloat

    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initials)
                    .font(GFont.ui(20, weight: .semibold))
                    .foregroundStyle(p.onPrimary)
                    .frame(width: size, height: size)
                    .background(p.primary)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

func closeBar(dismiss: DismissAction, id: String) -> some View {
    closeBar(action: { dismiss() }, id: id)
}

func closeBar(action: @escaping () -> Void, id: String) -> some View {
    CloseBar(action: action, id: id)
}

private struct CloseBar: View {
    @Environment(\.palette) private var p
    let action: () -> Void
    let id: String

    var body: some View {
        HStack {
            Spacer()
            Button(action: action) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.ink2)
                    .frame(width: 32, height: 32)
                    .background(p.surface)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier(id)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}
