Name:           cerebrobrasil-azure-cli-connector
Version:        1.0.0
Release:        1%{?dist}
Summary:        CerebroBrasil connector for Microsoft Azure CLI
License:        Proprietary
URL:            https://cerebrobrasil.com.br
BuildArch:      noarch
Requires:       bash
Requires:       git
Requires:       curl

%description
CerebroBrasil/Vimaka connector that provides Azure CLI installation helpers,
authentication commands, subscription management and Git identity setup.

%install
mkdir -p %{buildroot}/usr/bin
install -m 0755 %{_sourcedir}/cerebrobrasil-azure %{buildroot}/usr/bin/cerebrobrasil-azure

%files
/usr/bin/cerebrobrasil-azure

%changelog
* Sat Sep 19 2026 Vimaka Systems <vimakasystems@gmail.com> - 1.0.0-1
- Initial release
