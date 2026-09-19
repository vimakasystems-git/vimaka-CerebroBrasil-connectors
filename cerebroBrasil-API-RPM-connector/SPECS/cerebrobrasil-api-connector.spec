Name:           cerebrobrasil-api-connector
Version:        1.0.0
Release:        1%{?dist}
Summary:        CerebroBrasil Linux API connector
License:        Proprietary
URL:            https://cerebrobrasil.com.br
BuildArch:      noarch
Requires:       bash
Requires:       curl
Requires:       jq

%description
CerebroBrasil/Vimaka command-line connector for testing and consuming the
CerebroBrasil HTTPS API. Credentials are stored per-user and are not
embedded in the RPM.

%install
mkdir -p %{buildroot}%{_bindir}
install -m 0755 %{_sourcedir}/cerebrobrasil %{buildroot}%{_bindir}/cerebrobrasil

%files
%{_bindir}/cerebrobrasil

%changelog
* Sat Sep 19 2026 Vimaka Systems <vimakasystems@gmail.com> - 1.0.0-1
- Initial CerebroBrasil API RPM connector
